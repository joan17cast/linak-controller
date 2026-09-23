const { createApp } = Vue;

const AUTO_SCAN_TIMEOUT_MS = 20000;
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];
const LAST_DEVICE_KEY = "lastBluetoothDeviceId";

window.app = createApp({
  data() {
    return {
      name: "Desk",
      charId: "99fa0002-338a-1024-8a49-009c0215f78a",
      serviceId: "99fa0001-338a-1024-8a49-009c0215f78a",
      positionCharId: "99fa0021-338a-1024-8a49-009c0215f78a",
      positionServiceId: "99fa0020-338a-1024-8a49-009c0215f78a",

      automated: null,
      automationInterval: null,
      holdInterval: null,
      holding: false,
      reminder: null,
      reminderSoundInterval: null,
      connected: false,
      connecting: false,
      disconnectHandler: null,
      disconnectBoundDevice: null,
      positionChar: null,
      positionListener: null,
      device: null,
      handledSchedules: {},
      loading: false,
      movingTo: null,
      pos: Infinity,
      schedules: {},
      server: null,
      service: null,
      settings: null,
      hasAutoMinimized: false,

      commands: {
        UP: "4700",
        DOWN: "4600",
        STOP: "FF00",
      },
    };
  },

  methods: {
    automate() {
      this.automated = !this.automated;
    },

    showOptions() {
      if (window.desktop?.openOptions) {
        window.desktop.openOptions();
        return;
      }

      window.open("options.html", "_blank", "width=600px,height=600px");
    },

    hideMenu() {
      window.close();
    },

    startHold(direction) {
      this.holding = true;
      this.movingTo = null;
      this.clearHold();

      const send = () => {
        direction === "up" ? this.up() : this.down();
      };

      send();
      this.holdInterval = setInterval(send, 250);
    },

    endHold() {
      if (!this.holding) {
        return;
      }

      this.holding = false;
      this.clearHold();
      this.stop();
    },

    clearHold() {
      if (this.holdInterval) {
        clearInterval(this.holdInterval);
        this.holdInterval = null;
      }
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    pickDesk(devices) {
      if (!devices?.length) {
        return null;
      }

      const lastId = localStorage.getItem(LAST_DEVICE_KEY);

      if (lastId) {
        const match = devices.find((device) => device.id === lastId);

        if (match) {
          return match;
        }
      }

      const named = devices.find((device) =>
        (device.name || "").startsWith(this.name),
      );

      if (named) {
        return named;
      }

      return devices.length === 1 ? devices[0] : null;
    },

    rememberDevice(device) {
      if (device?.id) {
        localStorage.setItem(LAST_DEVICE_KEY, device.id);
      }
    },

    watchDisconnect(device) {
      if (this.disconnectBoundDevice && this.disconnectHandler) {
        this.disconnectBoundDevice.removeEventListener(
          "gattserverdisconnected",
          this.disconnectHandler,
        );
      }

      this.disconnectHandler = () => this.handleDisconnect();
      this.disconnectBoundDevice = device;
      device.addEventListener("gattserverdisconnected", this.disconnectHandler);
    },

    async handleDisconnect() {
      this.connected = false;
      await this.tryReconnectKnownDevice();
    },

    failConnection() {
      this.connected = false;
      this.loading = false;
    },

    async tryReconnectKnownDevice() {
      if (!this.device || this.connecting) {
        if (!this.connecting) {
          this.failConnection();
        }

        return;
      }

      this.connecting = true;
      this.loading = true;

      try {
        for (let i = 0; i < RECONNECT_BACKOFF_MS.length; i++) {
          try {
            await this.connectToDevice();
            await this.onPositionChange();
            return;
          } catch (e) {
            if (i < RECONNECT_BACKOFF_MS.length - 1) {
              await this.sleep(RECONNECT_BACKOFF_MS[i]);
            }
          }
        }

        this.failConnection();
      } finally {
        this.connecting = false;

        if (!this.connected) {
          this.loading = false;
        }
      }
    },

    async tryGetDevicesReconnect() {
      if (!navigator.bluetooth?.getDevices) {
        return false;
      }

      const devices = await navigator.bluetooth.getDevices();
      const device = this.pickDesk(devices);

      if (!device) {
        return false;
      }

      this.loading = true;
      this.connecting = true;
      this.device = device;
      this.watchDisconnect(device);
      await this.connectToDevice();
      await this.onPositionChange();

      return true;
    },

    async trySilentReconnect() {
      if (this.connecting) {
        return;
      }

      try {
        if (await this.tryGetDevicesReconnect()) {
          return;
        }
      } catch (e) {
        this.connected = false;
      } finally {
        this.connecting = false;

        if (!this.connected) {
          this.loading = false;
        }
      }

      if (this.connected) {
        return;
      }

      // Electron has no Web Bluetooth permission store without a crashing
      // Chromium flag. Scan like a click, but cancel if nothing appears.
      await this.connect({ scanTimeoutMs: AUTO_SCAN_TIMEOUT_MS });
    },

    async connect(options = {}) {
      if (this.connecting) {
        return;
      }

      const scanTimeoutMs =
        options && typeof options.scanTimeoutMs === "number"
          ? options.scanTimeoutMs
          : 0;

      this.loading = true;
      this.connected = false;
      this.connecting = true;

      let scanTimer = null;

      try {
        if (scanTimeoutMs) {
          scanTimer = setTimeout(() => {
            window.desktop?.cancelBluetoothScan?.();
          }, scanTimeoutMs);
        }

        await this.requestBluetoothAccess();
        await this.connectToDevice();
        await this.onPositionChange();
      } catch (e) {
        this.connected = false;
      } finally {
        if (scanTimer) {
          clearTimeout(scanTimer);
        }

        this.connecting = false;

        if (!this.connected) {
          this.loading = false;
        }
      }
    },

    up() {
      this.send(this.commands.UP);
    },

    down() {
      this.send(this.commands.DOWN);
    },

    stop() {
      this.movingTo = null;

      this.send(this.commands.STOP);
    },

    moveTo(pos) {
      this.movingTo = +pos;

      pos > this.movingTo ? this.down() : this.up();
    },

    togglePosition() {
      this.moveTo(this.toggleTargetMm());
    },

    toggleTargetMm() {
      const seated = +this.settings.positions[0];
      const standing = +this.settings.positions[1];

      if (this.isPos(seated)) {
        return standing;
      }

      if (this.isPos(standing)) {
        return seated;
      }

      const mid = (seated + standing) / 2;

      return this.pos < mid ? standing : seated;
    },

    reminderKind(targetMm) {
      const seated = +this.settings.positions[0];
      const standing = +this.settings.positions[1];
      const mid = (seated + standing) / 2;

      return targetMm >= mid ? "stand" : "sit";
    },

    // Play the reminder notification sound.
    //
    // NOTE: We deliberately do NOT route the audio through the Web Audio API
    // (AudioContext / createMediaElementSource). Once an <audio> element is
    // attached to a MediaElementSource its output is permanently routed
    // through that context, and an AudioContext silently switches to the
    // "suspended" state after periods of inactivity. Because reminders fire
    // from a timer (no user gesture), resume() is rejected and the sound
    // stops playing forever -- which is exactly the "works at first, then
    // breaks after a while" symptom. Plain HTMLAudioElement playback keeps
    // working thanks to sticky user activation, and we add a fallback below.
    // Play the reminder notification sound.
    //
    // NOTE: We deliberately do NOT route the audio through the Web Audio API
    // (AudioContext / createMediaElementSource). Once an <audio> element is
    // attached to a MediaElementSource its output is permanently routed
    // through that context, and an AudioContext silently switches to the
    // "suspended" state after periods of inactivity. Because reminders fire
    // from a timer (no user gesture), resume() is rejected and the sound
    // stops playing forever -- which is exactly the "works at first, then
    // breaks after a while" symptom. Plain HTMLAudioElement playback keeps
    // working thanks to sticky user activation, and we add a fallback below.
    playReminderSound() {
      try {
        if (!this.reminderAudio) {
          this.reminderAudio = new Audio("sounds/notification.mp3");
          this.reminderAudio.volume = 1.0;
          this.reminderAudio.preload = "auto";
        }

        this.reminderAudio.currentTime = 0;

        const playPromise = this.reminderAudio.play();

        if (playPromise) {
          playPromise.catch(() => this.fallbackReminderSound());
        }
      } catch (e) {
        this.fallbackReminderSound();
      }
    },

    // Last-resort fallback: the cached element can occasionally end up in a
    // state where play() is rejected (e.g. a stalled media element after a
    // long idle period). Spin up a fresh element so the reminder keeps
    // working instead of going silent.
    fallbackReminderSound() {
      try {
        const fallback = new Audio("sounds/notification.mp3");
        fallback.volume = 1.0;
        const playPromise = fallback.play();

        if (playPromise) {
          playPromise.catch(() => {});
        }
      } catch (e) {}
    },

    // Last-resort fallback: the cached element can occasionally end up in a
    // state where play() is rejected (e.g. a stalled media element after a
    // long idle period). Spin up a fresh element so the reminder keeps
    // working instead of going silent.
    fallbackReminderSound() {
      try {
        const fallback = new Audio("sounds/notification.mp3");
        fallback.volume = 1.0;
        const playPromise = fallback.play();

        if (playPromise) {
          playPromise.catch(() => {});
        }
      } catch (e) {}
    },

    promptReminder(targetMm) {
      if (!isFinite(targetMm) || this.isPos(targetMm) || this.reminder) {
        return;
      }

      this.reminder = {
        targetMm: +targetMm,
        kind: this.reminderKind(targetMm),
      };

      this.playReminderSound();
      this.startReminderSoundLoop();
      window.desktop?.showWindow();
    },

    // Repeat the notification sound every minute until the user picks an option.
    startReminderSoundLoop() {
      this.stopReminderSoundLoop();

      this.reminderSoundInterval = setInterval(() => {
        if (!this.reminder) {
          this.stopReminderSoundLoop();
          return;
        }

        this.playReminderSound();
      }, 60e3);
    },

    stopReminderSoundLoop() {
      if (this.reminderSoundInterval) {
        clearInterval(this.reminderSoundInterval);
        this.reminderSoundInterval = null;
      }
    },

    acceptReminder() {
      if (!this.reminder) {
        return;
      }

      const targetMm = this.reminder.targetMm;
      this.reminder = null;
      this.stopReminderSoundLoop();
      this.moveTo(targetMm);
    },

    dismissReminder() {
      this.reminder = null;
      this.stopReminderSoundLoop();
    },

    async send(command) {
      try {
        const char = await this.service.getCharacteristic(this.charId);

        await char.writeValue(this.hexStrToArray(command));
      } catch (e) {
        if (command === "FF00") {
          // console.log('Retrying STOP')
          this.send(command);
        }
      }
    },

    async requestBluetoothAccess() {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [this.serviceId, this.positionServiceId] },
          { namePrefix: this.name },
        ],
        // acceptAllDevices: true,
      });

      this.watchDisconnect(this.device);
    },

    async connectToDevice() {
      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService(this.serviceId);
      this.pos = await this.getCurrentPosition();
      this.rememberDevice(this.device);
      this.connected = true;
      this.loading = false;
    },

    async getCurrentPosition() {
      const service = await this.server.getPrimaryService(
        this.positionServiceId,
      );
      const char = await service.getCharacteristic(this.positionCharId);
      const value = await char.readValue();

      return this.toCm(value.buffer);
    },

    async onPositionChange() {
      const service = await this.server.getPrimaryService(
        this.positionServiceId,
      );
      const char = await service.getCharacteristic(this.positionCharId);

      if (this.positionChar && this.positionListener) {
        this.positionChar.removeEventListener(
          "characteristicvaluechanged",
          this.positionListener,
        );
      }

      this.positionListener = (e) => {
        this.pos = this.toCm(e.target.value.buffer);
      };
      this.positionChar = char;

      await char.startNotifications();
      char.addEventListener(
        "characteristicvaluechanged",
        this.positionListener,
      );
    },

    b2n(buffer) {
      return new Uint16Array(buffer)[0];
    },

    toCm(buffer) {
      return (381 / 3815) * this.b2n(buffer) + 625;
    },

    isPos(pos) {
      return this.pos >= pos - 5 && this.pos <= pos + 5;
    },

    hexStrToArray(hexString) {
      let decimals = [];

      for (let i = 0; i < hexString.length; i += 2) {
        decimals.push(parseInt(hexString.substr(i, 2), 16));
      }

      return new Uint8Array(decimals);
    },

    clearAutomationInterval() {
      clearInterval(this.automationInterval);
    },

    resetAutomationInterval() {
      this.clearAutomationInterval();

      this.automationInterval = setInterval(() => {
        if (!this.connected || !Object.keys(this.schedules).length) {
          return;
        }

        const date = new Date();
        const minOfDay = date.getHours() * 60 + date.getMinutes();

        if (this.handledSchedules[minOfDay]) {
          return;
        }

        if (this.schedules.hasOwnProperty(minOfDay)) {
          const schedule = this.schedules[minOfDay];
          let targetMm = null;

          if (schedule === "toggle") {
            targetMm = this.toggleTargetMm();
          } else {
            const pos = +this.settings.positions[+schedule];

            if (pos >= 630 && pos <= 1270) {
              targetMm = pos;
            }
          }

          if (targetMm !== null) {
            this.promptReminder(targetMm);
          }
        }

        this.handledSchedules[minOfDay] = true;
      }, 15e3);
    },

    translateSchedules() {
      this.schedules = {};

      if (!this.settings.schedules.length) {
        return;
      }

      this.settings.schedules.map((schedule) => {
        schedule.days
          .filter((d) => d)
          .map((dow) => {
            schedule.intervals.map((interval) => {
              const begin = interval.begin_hour * 60 + interval.begin_minute;
              const end = interval.end_hour * 60 + interval.end_minute;
              const period =
                interval.unit === "minute"
                  ? interval.period
                  : interval.period * 60;

              for (let minOfDay = begin; minOfDay <= end; minOfDay += period) {
                this.schedules[minOfDay] = "toggle";
              }
            });

            schedule.specific.map((spec) => {
              const minOfDay = spec.hour * 60 + spec.minute;

              this.schedules[minOfDay] = spec.action;
            });
          });
      });
    },

    // Load the persisted settings, merging them over the defaults. Called
    // synchronously on creation so features like "Minimize on Connect" are
    // available before the first (silent) connection can fire the watcher.
    getSettings() {
      try {
        this.settings = Object.assign(
          this.copy(window.defaultSettings),
          JSON.parse(localStorage.settings),
        );
      } catch (e) {
        this.settings = this.copy(window.defaultSettings);
      }
    },

    watchSettings() {
      let previousSettings = localStorage.settings;

      setInterval(() => {
        if (previousSettings !== localStorage.settings) {
          previousSettings = localStorage.settings;
          this.getSettings();
        }
      }, 1e3);
    },

    copy(object) {
      return JSON.parse(JSON.stringify(object));
    },

    // From milimeters to preferred units.
    convert(mm) {
      if (!isFinite(mm)) {
        return "—";
      }

      switch (this.settings.units) {
        case "mm":
          return Math.round(mm);
        case "cm":
          return Math.round(mm / 10);
        case "inch":
          return (mm / 25.4).toFixed(1);
      }
    },
  },

  computed: {
    connectLabel() {
      return this.loading
        ? "Connecting..."
        : "Press the bluetooth button on your table";
    },

    reminderLabel() {
      if (!this.reminder) {
        return "";
      }

      return this.reminder.kind === "stand"
        ? "It's time to get up"
        : "It's time to sit down";
    },

    reminderIcon() {
      if (!this.reminder) {
        return "";
      }

      return this.reminder.kind === "stand"
        ? "icons/stand-up.svg"
        : "icons/sit-down.svg";
    },
  },

  watch: {
    connected(value) {
      if (!value) {
        this.reminder = null;
        this.stopReminderSoundLoop();
        return;
      }

      // Once the desk connects on launch, drop to the system tray if enabled.
      if (this.settings?.minimizeOnConnect && !this.hasAutoMinimized) {
        this.hasAutoMinimized = true;
        window.desktop?.hideWindow();
      }
    },

    automated() {
      localStorage.setItem("automated", this.automated);

      if (this.automated) {
        this.resetAutomationInterval();
      } else {
        this.clearAutomationInterval();
      }
    },

    pos() {
      localStorage.setItem("previousPos", this.pos);

      if (this.movingTo === null) {
        return;
      }

      const pos = Math.round(this.pos);

      if (this.pos === this.movingTo) {
        return this.stop();
      }

      if (this.pos > this.movingTo) {
        if (this.pos <= this.movingTo + 10) return this.stop();
      } else {
        if (this.pos >= this.movingTo - 10) return this.stop();
      }

      this.pos > this.movingTo ? this.down() : this.up();
    },

    settings: {
      deep: true,
      handler() {
        this.translateSchedules();

        this.resetAutomationInterval();
      },
    },
  },

  created() {
    this.getSettings();

    this.watchSettings();

    this.pos = +localStorage.getItem("previousPos") || Infinity;
    this.automated = localStorage.getItem("automated") !== "false";
  },
}).mount("#app");
