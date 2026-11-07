---
title: See a device's hardware at a glance
date: 2026-11-07
category: site
---

Device pages now show a **Hardware** box with what's inside the device: image sensor, SoC, CPU, RAM, Wi-Fi, microSD, audio, and video output.

- **Read from the firmware itself.** Every Dahua firmware carries a list of the hardware it accepts. We decode that list, so the specs come from the files, not guesswork.
- **Sensor and chip.** Where the sensor and SoC are known, they're named (for example Sony IMX290, Ambarella S3L); the rest show things like "RAM 512 MiB" and "CPU 2× 900 MHz".
- **Hardware revisions.** When a device shipped in more than one hardware version, the box shows the newest and notes that others exist.
- **Raw hardware ID.** The full ID line is there under "Raw hardware ID" if you want to check a value yourself.

This can help you spot which devices share the same board, and so might take each other's firmware. It's decoded automatically and can be incomplete or wrong, so confirm your device's `updateSerial` before flashing anything.
