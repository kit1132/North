"""
Selenium-based CSV exporter for MoneyForward ME.

Automates browser login and CSV export from MoneyForward ME.
Handles 2FA authentication using TOTP.

WARNING: This module uses web scraping which may violate MoneyForward's
Terms of Service. Use at your own risk. The recommended approach is
manual CSV download from the MoneyForward web interface.
"""

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pyotp
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


@dataclass
class ExportResult:
    """Result of CSV export operation."""

    success: bool
    message: str
    file_path: Optional[Path] = None


class SeleniumExporter:
    """Automated CSV exporter using Selenium WebDriver.

    This class automates the process of:
    1. Logging into MoneyForward ME
    2. Handling 2FA if enabled
    3. Navigating to the export page
    4. Downloading the CSV file
    """

    # MoneyForward URLs
    LOGIN_URL = "https://id.moneyforward.com/sign_in/email"
    HOME_URL = "https://moneyforward.com/"
    EXPORT_URL = "https://moneyforward.com/cf/csv"

    # Timeouts
    PAGE_TIMEOUT = 30
    ELEMENT_TIMEOUT = 10
    DOWNLOAD_TIMEOUT = 60

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
        """
        self.email = email
        self.password = password
        self.totp_secret = totp_secret
        self.download_dir = Path(download_dir or os.path.expanduser("~/Downloads"))
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None

    def _create_driver(self) -> webdriver.Chrome:
        """Create and configure Chrome WebDriver."""
        options = Options()

        if self.headless:
            options.add_argument("--headless=new")

        # Required for headless Chrome
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")

        # Set download directory
        prefs = {
            "download.default_directory": str(self.download_dir),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        }
        options.add_experimental_option("prefs", prefs)

        # Use webdriver-manager to auto-manage ChromeDriver
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)

    def _generate_totp(self) -> str:
        """Generate current TOTP code.

        Returns:
            6-digit TOTP code
        """
        if not self.totp_secret:
            raise ValueError("TOTP secret not configured")

        totp = pyotp.TOTP(self.totp_secret)
        return totp.now()

    def _wait_for_element(
        self,
        by: str,
        value: str,
        timeout: Optional[int] = None,
    ):
        """Wait for an element to be present and visible."""
        timeout = timeout or self.ELEMENT_TIMEOUT
        wait = WebDriverWait(self.driver, timeout)
        return wait.until(EC.presence_of_element_located((by, value)))

    def _wait_for_clickable(
        self,
        by: str,
        value: str,
        timeout: Optional[int] = None,
    ):
        """Wait for an element to be clickable."""
        timeout = timeout or self.ELEMENT_TIMEOUT
        wait = WebDriverWait(self.driver, timeout)
        return wait.until(EC.element_to_be_clickable((by, value)))

    def _login(self) -> bool:
        """Perform login to MoneyForward.

        Returns:
            True if login successful
        """
        self.driver.get(self.LOGIN_URL)

        # Wait for email input and enter email
        email_input = self._wait_for_element(By.NAME, "mfid_user[email]")
        email_input.clear()
        email_input.send_keys(self.email)

        # Click next button
        next_button = self._wait_for_clickable(
            By.XPATH,
            "//button[@id='submitto' or contains(@class, 'submitBtn')]",
        )
        next_button.click()

        # Wait for password input
        time.sleep(1)  # Brief pause for page transition
        password_input = self._wait_for_element(By.NAME, "mfid_user[password]")
        password_input.clear()
        password_input.send_keys(self.password)

        # Click login button
        login_button = self._wait_for_clickable(
            By.XPATH,
            "//button[@id='submitto' or contains(@class, 'submitBtn')]",
        )
        login_button.click()

        # Check for 2FA
        time.sleep(2)
        return self._handle_2fa()

    def _handle_2fa(self) -> bool:
        """Handle 2FA if required.

        Returns:
            True if 2FA handled successfully or not required
        """
        try:
            # Check if 2FA page is shown
            totp_input = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.NAME, "mfid_user[code]"))
            )

            if not self.totp_secret:
                print("2FA required but TOTP secret not configured")
                return False

            # Generate and enter TOTP code
            code = self._generate_totp()
            totp_input.clear()
            totp_input.send_keys(code)

            # Submit
            submit_button = self._wait_for_clickable(
                By.XPATH,
                "//button[@id='submitto' or contains(@class, 'submitBtn')]",
            )
            submit_button.click()

            # Wait for redirect
            time.sleep(3)

        except Exception:
            # 2FA not required, continue
            pass

        # Verify login success by checking for home page elements
        try:
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located(
                    (By.XPATH, "//a[contains(@href, '/cf') or contains(@href, '/accounts')]")
                )
            )
            return True
        except Exception:
            return False

    def _wait_for_download(self, pattern: str = "*.csv") -> Optional[Path]:
        """Wait for a file matching pattern to appear in download directory.

        Args:
            pattern: Glob pattern for the file

        Returns:
            Path to downloaded file, or None if timeout
        """
        start_time = time.time()
        initial_files = set(self.download_dir.glob(pattern))

        while time.time() - start_time < self.DOWNLOAD_TIMEOUT:
            current_files = set(self.download_dir.glob(pattern))
            new_files = current_files - initial_files

            # Check for completed downloads (not .crdownload)
            for f in new_files:
                if not f.suffix.endswith(".crdownload"):
                    return f

            time.sleep(1)

        return None

    def _export_csv(self, year_month: Optional[str] = None) -> Optional[Path]:
        """Navigate to export page and download CSV.

        Args:
            year_month: Month to export in YYYY-MM format (defaults to current)

        Returns:
            Path to downloaded CSV, or None on failure
        """
        # Navigate to CSV export page
        self.driver.get(self.EXPORT_URL)
        time.sleep(2)

        # If specific month requested, select it
        if year_month:
            # MoneyForward uses dropdown for month selection
            # Implementation depends on current UI
            pass  # TODO: Add month selection if needed

        # Click export button
        try:
            export_button = self._wait_for_clickable(
                By.XPATH,
                "//input[@value='ダウンロード' or @type='submit'] | //button[contains(text(), 'ダウンロード')]",
            )
            export_button.click()
        except Exception as e:
            print(f"Failed to find export button: {e}")
            return None

        # Wait for download
        return self._wait_for_download()

    def export(self, year_month: Optional[str] = None) -> ExportResult:
        """Execute full export process.

        Args:
            year_month: Month to export in YYYY-MM format (defaults to current)

        Returns:
            ExportResult with status and file path
        """
        try:
            # Create browser
            self.driver = self._create_driver()
            self.driver.set_page_load_timeout(self.PAGE_TIMEOUT)

            # Login
            if not self._login():
                return ExportResult(
                    success=False,
                    message="Login failed. Check credentials or 2FA.",
                )

            # Export CSV
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
                )

        except Exception as e:
            return ExportResult(
                success=False,
                message=f"Export failed: {str(e)}",
            )

        finally:
            if self.driver:
                self.driver.quit()

    def close(self):
        """Close the browser if open."""
        if self.driver:
            self.driver.quit()
            self.driver = None


def export_current_month(
    email: str,
    password: str,
    totp_secret: Optional[str] = None,
    download_dir: Optional[str] = None,
) -> ExportResult:
    """Convenience function to export current month's data.

    Args:
        email: MoneyForward account email
        password: MoneyForward account password
        totp_secret: TOTP secret for 2FA (optional)
        download_dir: Directory for downloaded CSVs

    Returns:
        ExportResult with status and file path
    """
    exporter = SeleniumExporter(
        email=email,
        password=password,
        totp_secret=totp_secret,
        download_dir=download_dir,
    )
    return exporter.export()
