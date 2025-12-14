"""
Selenium-based CSV exporter for MoneyForward ME.

Automates browser login and CSV export from MoneyForward ME.
Handles 2FA authentication using TOTP.

WARNING: This module uses web scraping which may violate MoneyForward's
Terms of Service. Use at your own risk. The recommended approach is
manual CSV download from the MoneyForward web interface.
"""

import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pyotp
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

# ロガー設定
logger = logging.getLogger(__name__)


class SeleniumExportError(Exception):
    """Seleniumエクスポートエラーを表すカスタム例外"""
    pass


@dataclass
class ExportResult:
    """Result of CSV export operation."""

    success: bool
    message: str
    file_path: Optional[Path] = None
    error_type: Optional[str] = None  # エラー種別（デバッグ用）


class SeleniumExporter:
    """Automated CSV exporter using Selenium WebDriver.

    Seleniumを使用してMoneyForward MEからCSVを自動エクスポートする。

    処理フロー:
    1. MoneyForward MEにログイン
    2. 2FA認証（必要な場合）
    3. CSVエクスポートページに移動
    4. CSVファイルをダウンロード

    WARNING: この機能はWebスクレイピングを使用しており、
    MoneyForwardの利用規約に違反する可能性があります。
    推奨されるアプローチは、Web画面から手動でCSVをダウンロードすることです。
    """

    # MoneyForward URLs
    LOGIN_URL = "https://id.moneyforward.com/sign_in/email"
    HOME_URL = "https://moneyforward.com/"
    EXPORT_URL = "https://moneyforward.com/cf/csv"

    # タイムアウト設定
    PAGE_TIMEOUT = 30
    ELEMENT_TIMEOUT = 10
    DOWNLOAD_TIMEOUT = 60

    # リトライ設定
    MAX_LOGIN_RETRIES = 2

    def __init__(
        self,
        email: str,
        password: str,
        totp_secret: Optional[str] = None,
        download_dir: Optional[str] = None,
        headless: bool = True,
    ):
        """Initialize the exporter.

        Args:
            email: MoneyForward account email
            password: MoneyForward account password
            totp_secret: TOTP secret for 2FA (optional)
            download_dir: Directory for downloaded CSVs
            headless: Run browser in headless mode

        Raises:
            SeleniumExportError: If credentials are invalid
        """
        # 入力バリデーション
        self._validate_credentials(email, password)

        self.email = email.strip()
        self.password = password
        self.totp_secret = totp_secret.strip() if totp_secret else None
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None

        # ダウンロードディレクトリの設定
        if download_dir:
            self.download_dir = Path(download_dir)
        else:
            self.download_dir = Path(os.path.expanduser("~/Downloads"))

        # ダウンロードディレクトリの存在確認
        if not self.download_dir.exists():
            logger.warning(f"Download directory does not exist: {self.download_dir}")
            try:
                self.download_dir.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created download directory: {self.download_dir}")
            except OSError as e:
                raise SeleniumExportError(
                    f"Cannot create download directory: {e}"
                ) from e

    def _validate_credentials(self, email: str, password: str) -> None:
        """認証情報のバリデーション

        Args:
            email: メールアドレス
            password: パスワード

        Raises:
            SeleniumExportError: 認証情報が無効な場合
        """
        if not email or not email.strip():
            raise SeleniumExportError("Email cannot be empty")

        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email.strip()):
            raise SeleniumExportError(f"Invalid email format: {email}")

        if not password:
            raise SeleniumExportError("Password cannot be empty")

    def _create_driver(self) -> webdriver.Chrome:
        """Chrome WebDriverを作成・設定

        Returns:
            設定済みのChrome WebDriver

        Raises:
            SeleniumExportError: WebDriverの作成に失敗した場合
        """
        try:
            options = Options()

            if self.headless:
                options.add_argument("--headless=new")

            # ヘッドレスChrome用の必須設定
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1920,1080")

            # User-Agent設定（ボット検出回避）
            options.add_argument(
                "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )

            # ダウンロード設定
            prefs = {
                "download.default_directory": str(self.download_dir.absolute()),
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": True,
            }
            options.add_experimental_option("prefs", prefs)

            # ChromeDriverの自動管理（webdriver-manager使用）
            logger.debug("Installing/updating ChromeDriver...")
            service = Service(ChromeDriverManager().install())

            driver = webdriver.Chrome(service=service, options=options)
            logger.info("Chrome WebDriver created successfully")

            return driver

        except WebDriverException as e:
            raise SeleniumExportError(
                f"Failed to create Chrome WebDriver: {e}. "
                "Make sure Chrome browser is installed."
            ) from e
        except Exception as e:
            raise SeleniumExportError(
                f"Unexpected error creating WebDriver: {e}"
            ) from e

    def _generate_totp(self) -> str:
        """現在のTOTPコードを生成

        Returns:
            6桁のTOTPコード

        Raises:
            SeleniumExportError: TOTP生成に失敗した場合
        """
        if not self.totp_secret:
            raise SeleniumExportError("TOTP secret not configured")

        try:
            totp = pyotp.TOTP(self.totp_secret)
            code = totp.now()
            logger.debug("TOTP code generated successfully")
            return code
        except Exception as e:
            raise SeleniumExportError(
                f"Failed to generate TOTP code: {e}. "
                "Check if TOTP secret is valid Base32 string."
            ) from e

    def _wait_for_element(
        self,
        by: str,
        value: str,
        timeout: Optional[int] = None,
        clickable: bool = False,
    ):
        """要素が表示されるまで待機

        Args:
            by: ロケータータイプ（By.ID, By.NAMEなど）
            value: ロケーター値
            timeout: タイムアウト秒数
            clickable: クリック可能になるまで待機するか

        Returns:
            見つかった要素

        Raises:
            TimeoutException: タイムアウトした場合
        """
        timeout = timeout or self.ELEMENT_TIMEOUT
        wait = WebDriverWait(self.driver, timeout)

        if clickable:
            condition = EC.element_to_be_clickable((by, value))
        else:
            condition = EC.presence_of_element_located((by, value))

        return wait.until(condition)

    def _login(self) -> bool:
        """MoneyForwardにログイン

        Returns:
            ログイン成功の場合True

        Raises:
            SeleniumExportError: 致命的なエラーが発生した場合
        """
        logger.info("Starting login process...")

        try:
            self.driver.get(self.LOGIN_URL)

            # メールアドレス入力を待機して入力
            logger.debug("Entering email address...")
            email_input = self._wait_for_element(By.NAME, "mfid_user[email]")
            email_input.clear()
            email_input.send_keys(self.email)

            # 次へボタンをクリック
            next_button = self._wait_for_element(
                By.XPATH,
                "//button[@id='submitto' or contains(@class, 'submitBtn')]",
                clickable=True,
            )
            next_button.click()

            # ページ遷移を待機
            time.sleep(1.5)

            # パスワード入力
            logger.debug("Entering password...")
            password_input = self._wait_for_element(By.NAME, "mfid_user[password]")
            password_input.clear()
            password_input.send_keys(self.password)

            # ログインボタンをクリック
            login_button = self._wait_for_element(
                By.XPATH,
                "//button[@id='submitto' or contains(@class, 'submitBtn')]",
                clickable=True,
            )
            login_button.click()

            # 2FAの処理
            time.sleep(2)
            return self._handle_2fa()

        except TimeoutException as e:
            logger.error(f"Login timeout: {e}")
            return False
        except NoSuchElementException as e:
            logger.error(f"Login element not found: {e}")
            return False
        except Exception as e:
            logger.error(f"Login error: {e}")
            raise SeleniumExportError(f"Login failed: {e}") from e

    def _handle_2fa(self) -> bool:
        """2FA認証を処理

        Returns:
            2FA成功または不要の場合True
        """
        try:
            # 2FAページが表示されているか確認（短いタイムアウト）
            totp_input = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.NAME, "mfid_user[code]"))
            )

            logger.info("2FA page detected")

            if not self.totp_secret:
                logger.error("2FA required but TOTP secret not configured")
                return False

            # TOTPコードを生成して入力
            code = self._generate_totp()
            logger.debug("Entering TOTP code...")
            totp_input.clear()
            totp_input.send_keys(code)

            # 送信ボタンをクリック
            submit_button = self._wait_for_element(
                By.XPATH,
                "//button[@id='submitto' or contains(@class, 'submitBtn')]",
                clickable=True,
            )
            submit_button.click()

            # リダイレクトを待機
            time.sleep(3)

        except TimeoutException:
            # 2FAページが表示されない場合は2FA不要
            logger.debug("2FA not required")

        except Exception as e:
            logger.warning(f"2FA handling warning: {e}")

        # ログイン成功を確認
        return self._verify_login_success()

    def _verify_login_success(self) -> bool:
        """ログイン成功を確認

        Returns:
            ログイン成功の場合True
        """
        try:
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located(
                    (By.XPATH, "//a[contains(@href, '/cf') or contains(@href, '/accounts')]")
                )
            )
            logger.info("Login successful")
            return True

        except TimeoutException:
            logger.error("Login verification failed - home page elements not found")
            # スクリーンショットを保存（デバッグ用）
            self._save_debug_screenshot("login_failed")
            return False

    def _save_debug_screenshot(self, name: str) -> None:
        """デバッグ用スクリーンショットを保存

        Args:
            name: ファイル名のプレフィックス
        """
        try:
            screenshot_path = self.download_dir / f"debug_{name}_{int(time.time())}.png"
            self.driver.save_screenshot(str(screenshot_path))
            logger.debug(f"Debug screenshot saved: {screenshot_path}")
        except Exception as e:
            logger.warning(f"Failed to save screenshot: {e}")

    def _wait_for_download(self, pattern: str = "*.csv") -> Optional[Path]:
        """ダウンロード完了を待機

        Args:
            pattern: ファイルのglobパターン

        Returns:
            ダウンロードされたファイルのパス、タイムアウト時はNone
        """
        logger.info("Waiting for CSV download...")
        start_time = time.time()
        initial_files = set(self.download_dir.glob(pattern))

        while time.time() - start_time < self.DOWNLOAD_TIMEOUT:
            current_files = set(self.download_dir.glob(pattern))
            new_files = current_files - initial_files

            # 完了したダウンロードをチェック（.crdownloadでないもの）
            for f in new_files:
                if not str(f).endswith(".crdownload"):
                    logger.info(f"Download completed: {f}")
                    return f

            time.sleep(1)

        logger.warning("Download timeout")
        return None

    def _export_csv(self, year_month: Optional[str] = None) -> Optional[Path]:
        """CSVエクスポートページに移動してダウンロード

        Args:
            year_month: エクスポートする月（YYYY-MM形式、デフォルトは当月）

        Returns:
            ダウンロードされたCSVのパス、失敗時はNone
        """
        logger.info("Navigating to CSV export page...")

        try:
            self.driver.get(self.EXPORT_URL)
            time.sleep(2)

            # 特定の月が指定された場合（TODO: UI依存のため実装保留）
            if year_month:
                logger.warning("Month selection not yet implemented")

            # エクスポートボタンをクリック
            export_button = self._wait_for_element(
                By.XPATH,
                "//input[@value='ダウンロード' or @type='submit'] | "
                "//button[contains(text(), 'ダウンロード')]",
                clickable=True,
            )
            export_button.click()
            logger.debug("Export button clicked")

            # ダウンロード完了を待機
            return self._wait_for_download()

        except TimeoutException:
            logger.error("Export button not found - page structure may have changed")
            self._save_debug_screenshot("export_button_not_found")
            return None
        except Exception as e:
            logger.error(f"Export error: {e}")
            return None

    def export(self, year_month: Optional[str] = None) -> ExportResult:
        """エクスポート処理を実行

        Args:
            year_month: エクスポートする月（YYYY-MM形式、デフォルトは当月）

        Returns:
            ExportResult with status and file path
        """
        logger.info("Starting MoneyForward ME CSV export...")

        try:
            # ブラウザを作成
            self.driver = self._create_driver()
            self.driver.set_page_load_timeout(self.PAGE_TIMEOUT)

            # ログイン
            if not self._login():
                return ExportResult(
                    success=False,
                    message="Login failed. Check credentials or 2FA configuration.",
                    error_type="LOGIN_FAILED",
                )

            # CSVエクスポート
            csv_path = self._export_csv(year_month)

            if csv_path:
                return ExportResult(
                    success=True,
                    message="CSV exported successfully",
                    file_path=csv_path,
                )
            else:
                return ExportResult(
                    success=False,
                    message="CSV download failed or timed out",
                    error_type="DOWNLOAD_FAILED",
                )

        except SeleniumExportError as e:
            logger.error(f"Export error: {e}")
            return ExportResult(
                success=False,
                message=str(e),
                error_type="SELENIUM_ERROR",
            )

        except Exception as e:
            logger.error(f"Unexpected export error: {e}")
            return ExportResult(
                success=False,
                message=f"Export failed: {str(e)}",
                error_type="UNEXPECTED_ERROR",
            )

        finally:
            self.close()

    def close(self) -> None:
        """ブラウザを閉じる"""
        if self.driver:
            try:
                self.driver.quit()
                logger.debug("Browser closed")
            except Exception as e:
                logger.warning(f"Error closing browser: {e}")
            finally:
                self.driver = None


def export_current_month(
    email: str,
    password: str,
    totp_secret: Optional[str] = None,
    download_dir: Optional[str] = None,
) -> ExportResult:
    """当月のデータをエクスポートするコンビニエンス関数

    Args:
        email: MoneyForward account email
        password: MoneyForward account password
        totp_secret: TOTP secret for 2FA (optional)
        download_dir: Directory for downloaded CSVs

    Returns:
        ExportResult with status and file path
    """
    try:
        exporter = SeleniumExporter(
            email=email,
            password=password,
            totp_secret=totp_secret,
            download_dir=download_dir,
        )
        return exporter.export()
    except SeleniumExportError as e:
        return ExportResult(
            success=False,
            message=str(e),
            error_type="INIT_ERROR",
        )
