#!/bin/bash
#
# Setup script for MoneyForward ME Weekly Analysis launchd job
#
# Usage:
#   ./setup_launchd.sh [install|uninstall|status|run]
#

set -e

PLIST_NAME="com.moneyforward.weekly-analysis"
PLIST_FILE="${PLIST_NAME}.plist"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_PLIST="${SCRIPT_DIR}/${PLIST_FILE}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

install() {
    echo "Installing MoneyForward ME Weekly Analysis..."

    # Create LaunchAgents directory if needed
    if [ ! -d "${LAUNCH_AGENTS_DIR}" ]; then
        mkdir -p "${LAUNCH_AGENTS_DIR}"
        print_status "Created ${LAUNCH_AGENTS_DIR}"
    fi

    # Create logs directory
    LOG_DIR="${HOME}/logs/moneyforward"
    if [ ! -d "${LOG_DIR}" ]; then
        mkdir -p "${LOG_DIR}"
        print_status "Created log directory: ${LOG_DIR}"
    fi

    # Copy and customize plist
    if [ ! -f "${SOURCE_PLIST}" ]; then
        print_error "Source plist not found: ${SOURCE_PLIST}"
        exit 1
    fi

    # Replace YOUR_USERNAME with actual username
    sed "s/YOUR_USERNAME/${USER}/g" "${SOURCE_PLIST}" > "${LAUNCH_AGENTS_DIR}/${PLIST_FILE}"
    print_status "Installed plist to ${LAUNCH_AGENTS_DIR}/${PLIST_FILE}"

    # Load the job
    launchctl load "${LAUNCH_AGENTS_DIR}/${PLIST_FILE}"
    print_status "Loaded job: ${PLIST_NAME}"

    echo ""
    echo "Installation complete!"
    echo "The job will run every Monday at 9:00 AM."
    echo ""
    echo "Before first run, ensure you have:"
    echo "  1. Created a .env file with your credentials"
    echo "  2. Updated the WorkingDirectory path in the plist if needed"
    echo "  3. Tested the script manually: python -m moneyforward_analyzer.main --dry-run"
}

uninstall() {
    echo "Uninstalling MoneyForward ME Weekly Analysis..."

    TARGET_PLIST="${LAUNCH_AGENTS_DIR}/${PLIST_FILE}"

    if [ -f "${TARGET_PLIST}" ]; then
        # Unload first
        launchctl unload "${TARGET_PLIST}" 2>/dev/null || true
        print_status "Unloaded job"

        # Remove plist
        rm "${TARGET_PLIST}"
        print_status "Removed plist file"
    else
        print_warning "Plist not found at ${TARGET_PLIST}"
    fi

    echo "Uninstallation complete!"
}

status() {
    echo "Checking status of ${PLIST_NAME}..."
    echo ""

    if launchctl list | grep -q "${PLIST_NAME}"; then
        echo "Status: LOADED"
        launchctl list "${PLIST_NAME}"
    else
        echo "Status: NOT LOADED"
    fi
}

run() {
    echo "Manually running ${PLIST_NAME}..."
    launchctl start "${PLIST_NAME}"
    print_status "Job started. Check logs for output."
}

# Main
case "${1:-help}" in
    install)
        install
        ;;
    uninstall)
        uninstall
        ;;
    status)
        status
        ;;
    run)
        run
        ;;
    *)
        echo "Usage: $0 [install|uninstall|status|run]"
        echo ""
        echo "Commands:"
        echo "  install    Install and load the launchd job"
        echo "  uninstall  Unload and remove the launchd job"
        echo "  status     Check if the job is loaded"
        echo "  run        Manually trigger the job"
        exit 1
        ;;
esac
