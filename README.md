# Phone Checker

Phone Checker is a local Windows dashboard for viewing Android phone status and using selected ADB and Fastboot functions. It runs in your browser and communicates with Android Platform Tools installed on your computer.

## Features

### Dashboard and device connection

- Checks for connected ADB and Fastboot devices and shows their connection status.
- Displays live Android device information after an authorized ADB connection. Before a phone is read, demo/sample metrics may be shown.
- Shows basic Fastboot product, version, and fastbootd information when the bootloader exposes those values.
- Supports automatic device refresh, or manual-only checks.

### Phone information

Over ADB, the dashboard reads device and software information, including manufacturer, model, device codename, Android version, build ID, security patch date, API level, and serial.

It also displays:

- Battery charge, charging state, reported health, and battery temperature.
- Read-only Battery Saver requested/active status.
- Internal storage used, total capacity, available capacity, and used percentage. Storage values depend on the data Android exposes and can vary slightly from the phone's Settings display.
- Reported battery, CPU, GPU, SoC, and skin temperature readings when the phone exposes those sensors. Sensor names and availability vary by device.

Device readings are informational. Some phones do not expose every value.

### Device terminal

- Provides ADB presets for device properties, battery, storage, thermal service, memory, uptime, Battery Saver status, and reboot.
- Accepts manual ADB commands for the selected authorized device. Custom commands require browser confirmation and are bounded in length.
- Provides limited Fastboot checks (`getvar product`, `getvar version`, `getvar is-userspace`, and device listing) plus reboot.
- Requires a selected connected device for device-specific commands.

ADB commands can change phone settings or data. Review commands before confirming them. There is no dedicated power-mode changer in the dashboard; Battery Saver is displayed as read-only status. Fastboot is intentionally restricted: the terminal does not allow arbitrary Fastboot commands.

### Install APKs from the project folder

Put APKs directly in `apk_files`, select an authorized ADB device and an APK in the terminal, then confirm installation. Only direct-child `.apk` files are listed and accepted; subfolders and paths outside the project folder are not used. Install only APKs from sources you trust.

### Flash boot or recovery images

Put image files directly in `flash_files`, select a connected Fastboot device, choose **Boot** or **Recovery**, select a `.img` file, and confirm. The flash helper accepts only direct-child `.img` files in that folder and only targets the boot or recovery partition. It does not expose erase or bootloader-unlock operations.

> **Warning:** Flashing writes to the phone. An incorrect or incompatible image can make the phone unbootable or cause data loss. Verify the exact device model, variant, and partition before proceeding; keep a recovery plan and do not disconnect during the operation.

### Display and dashboard settings

Settings are saved in the current browser and include:

- Mint, ocean blue, violet, or amber accent color.
- Comfortable or compact dashboard spacing.
- Reduced animations.
- Show/hide temperature details and recommendations.
- Automatic device refresh every 15 seconds, 30 seconds, 1, 2, 5, or 10 minutes, or manual-only.

Automatic refresh checks status and reads device information; it does not change phone settings. Everyday recommendations and the care guide provide general battery, storage, and temperature tips.

## Not included

Phone Checker does not include a kernel editor or controls for CPU/GPU clocks, voltage, governor, or overclocking. Those features require device-specific kernel support and elevated privileges and are not implemented here. It does not require root for its listed functions. It also does not unlock the bootloader or erase partitions.

## Requirements

- Windows 10 or 11
- Python 3.9 or newer
- Android SDK Platform Tools (`adb` and `fastboot`) available on PATH
- A modern web browser
- An Android phone and a USB data cable

The Python server uses only Python's standard library; no `pip install` step or third-party Python module is needed. See [Install.md](Install.md) for download commands, setup, and troubleshooting.

## Run

Open PowerShell in the folder containing `app_server.py` and run:

```powershell
python app_server.py
```

Open <http://127.0.0.1:8000/> in your browser and keep the PowerShell window open. Stop the server with **Ctrl+C**. The server binds to the local computer only (`127.0.0.1`) and is not intended for network access.

## Project layout

```text
phone_checker/
├── app_server.py       # Local web server and ADB/Fastboot integration
├── app.js              # Dashboard behavior and device controls
├── index.html          # Dashboard interface
├── styles.css          # Dashboard styling
├── Install.md          # Windows installation and setup
├── README.md           # Project overview and feature guide
├── apk_files/          # Place trusted APK files here
│   └── README.txt
└── flash_files/        # Place boot/recovery .img files here
    └── README.txt
```

## License

No license file is currently included. Contact the project owner before redistributing or reusing this project.
