const { createApp } = Vue;

let testAudio = null;

window.options = createApp({
  data() {
    return {
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      settings: null,
      defaultSettings,
      launchAtLogin: false,
    };
  },

  methods: {
    getSettings() {
      try {
        this.settings = Object.assign(
          this.copy(this.defaultSettings),
          JSON.parse(localStorage.settings),
        );
      } catch (e) {
        this.settings = this.copy(this.defaultSettings);
      }
    },

    // Play the notification sound so the user can test it.
    testSound() {
      testAudio = testAudio || new Audio("sounds/notification.mp3");
      testAudio.currentTime = 0;

      testAudio.play().catch(() => {});
    },

    // Read the current launch-at-login state from the operating system.
    getLaunchAtLogin() {
      if (!window.desktop?.getLaunchAtLogin) return;

      window.desktop.getLaunchAtLogin().then((value) => {
        this.launchAtLogin = !!value;
      });
    },

    // Toggle whether the app should start with the operating system.
    toggleLaunchAtLogin() {
      if (!window.desktop?.setLaunchAtLogin) return;

      window.desktop.setLaunchAtLogin(!this.launchAtLogin).then((value) => {
        this.launchAtLogin = !!value;
      });
    },

    // Close the frameless options window.
    closeOptions() {
      window.close();
    },

    copy(object) {
      return JSON.parse(JSON.stringify(object));
    },

    // From preferred units to milimeteres.
    backwardsConvert(value) {
      switch (this.settings.units) {
        case "mm":
          return value;
        case "cm":
          return value * 10;
        case "inch":
          return Math.round(value * 25.4);
      }
    },

    // From milimeters to preferred units.
    convert(mm) {
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

  watch: {
    settings: {
      deep: true,
      handler(settings) {
        localStorage.settings = JSON.stringify(settings);
      },
    },
  },

  created() {
    this.getSettings();
    this.getLaunchAtLogin();
  },
}).mount("#options");
