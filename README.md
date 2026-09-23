# LINAK CTRL

An app which allows you to automate your IKEA LINAK height adjustable desk.

It's possible to create schedules so that the desk switches to any position at specific times, or that it simply automatically toggles between seated and standing positions.

I've created this because I wanted to force myself to actually use the standing position, because I usually forget that I have this ability while working on something for many hours, and also I don't think it's great to use it all day long in a single position, either standing or sitting.

![](src/img/Ikea-Linak.png)

## Features

- Connect to your desk over **Web Bluetooth** (no pairing required in the OS).
- See the current height in **centimeters, inches or millimeters**.
- Move to a **seated** or **standing** position with a single click.
- Hold the up/down arrows to **manually nudge** the desk to any height.
- Stop movement at any point.
- Define **schedules** (per weekday) that toggle between sitting and standing, or jump to a specific position at a given time.
- **Automation** runs in the background and reminds you (with a sound + overlay) when it's time to change posture.
- Lives in the **system tray** and auto-connects to the last desk on launch.
- Optional **launch at login**.

## Interface

The main window is a minimalistic bar (560×56) that floats at the bottom-center of your screen. From left to right:

- **Height chip** — the current desk height (e.g. `110` cm). Drag this to move the window. You can pick cm / inch / mm in the settings.
- **Sit down** — moves the desk to your seated position (configurable in settings).
- **Stand up** — moves the desk to your standing position (configurable in settings).
- **Stop** — stops any movement immediately.
- **Move down / Move up** — hold to lower or raise the desk continuously; release to stop.
- **Settings** — opens the preferences window (units, positions, schedules, automation).
- **Hide** — closes the bar to the system tray (the app keeps running).

When a schedule fires, the bar is replaced by a reminder overlay: a **check** accepts and moves the desk to the target posture, a **close (X)** dismisses it without moving.

The app has no native close/minimize/maximize buttons by design. To quit completely, use **Quit** in the tray menu. To temporarily hide it, use the Hide button or the tray's *Show/Hide*.

## How to use

First step will be to download this repository locally and cd into it:

```
git clone https://github.com/joan17cast/linak-controller.git

cd linak-controller
```

If you don't have git installed, you can always [download the project as a zip file](https://github.com/joan17cast/linak-controller/archive/refs/heads/main.zip).

> **Note:** You might need to put the desk in discovery mode the first time you connect to it through the app. You can do that by pressing the bluetooth button on the controller for 2-3 seconds, until a blue LED comes on. It quickly turns off, but it'll be in discovery mode.

## Build it yourself using `electron-builder`

You will have to have [Node.js](https://nodejs.org/en/) installed on your system and run the following commands:

```
npm install

npm run build
```

This produces Windows installers/portables in the `dist/` directory. You can also run `npx electron-builder` directly for other platforms (the project is configured for Windows `nsis`/`portable` and macOS).

## Or, open it through Node.js

An alternative without building it into an executable app is to run it using Node.js.

Assuming you have Node installed, run the following command:

```
npm start
```

The app will start, sit in the system tray, and try to auto-connect to the last desk it used.

## Settings & automation

Open **Settings** from the bar or the tray menu to configure:

- **Units** — cm / inch / mm.
- **Show current height** — toggle the height chip.
- **Positions** — seated, standing and up to 8 extra memory positions (limits 630–1270 mm).
- **Schedules** — pick weekdays, define periodic intervals (e.g. toggle every hour between 10:00 and 18:00) and/or specific times that go to a position or toggle.
- **Automation** — when enabled, the scheduler reminds you to change posture; accepting the reminder moves the desk.
- **Launch at login** — start the app automatically when you log in.

Changes are saved locally and applied within a second.

## Author

- [Cosmin Gheorghita](https://gecko.dev) — original author
- Fork maintained at [joan17cast/linak-controller](https://github.com/joan17cast/linak-controller)