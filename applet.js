const Applet = imports.ui.applet;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;

const UUID = "wallpaper-changer@amaan-mohib";
const ICON = "icon";
const CMD_SETTINGS = "cinnamon-settings applets " + UUID;
const Gettext = imports.gettext;
const AppletDir = imports.ui.appletManager.appletMeta[UUID].path;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
  return Gettext.dgettext(UUID, str);
}
function log(message) {
  global.log(`[${UUID}]: ${message}`);
}
function logError(message) {
  global.logError(`[${UUID}]: ${message}`);
}
function backtick(command) {
  try {
    let [result, stdout, stderr] = GLib.spawn_command_line_sync(command);
    if (stdout != null) {
      return stdout.toString();
    }
  } catch (e) {
    logError(e);
  }

  return "";
}
function formatTime(time) {
  if (time < 60) return `${time}s`;
  else if (time < 3600) return `${parseInt(Number(time) / 60)}min`;
  return `${parseInt(Number(time) / 3600)}hr`;
}

const SettingsMap = {
  wallpaper_delay: "Delay",
  wallpaper_path: "Wallpapers path",
  wallpaper_timer: "Timer (interval to check for updates)",
  wallpaper_paused: "Pause slideshow",
};

function WallpaperChanger(orientation, panel_height, instance_id) {
  this.settings = new Settings.AppletSettings(this, UUID, instance_id);
  this._init(orientation, panel_height, instance_id);
}

WallpaperChanger.prototype = {
  __proto__: Applet.IconApplet.prototype,

  _init: function (orientation, panel_height, instance_id) {
    Applet.IconApplet.prototype._init.call(
      this,
      orientation,
      panel_height,
      instance_id
    );

    Object.keys(SettingsMap).forEach((key) => {
      this.settings.bindProperty(
        Settings.BindingDirection.IN,
        key,
        key,
        function () {
          this.property_changed(key);
        },
        null
      );
    });
    this.set_applet_icon_name("icon");
    this.set_applet_tooltip(_("Wallpaper Changer"));
    this.initialize_wallpaper_dir();
    this.initMenu(orientation);
    this._start_applet();
  },

  on_applet_clicked: function () {
    this.menu.toggle();
  },

  open_settings: function () {
    Util.spawnCommandLine(CMD_SETTINGS);
  },

  _start_applet: function (override) {
    if (this.wallpaper_paused) {
      this.buildMenu();
      this._removeTimeout();
    } else {
      this.run_wallpaper_script(override);
      this.buildMenu();
      this._setTimeout(this.wallpaper_timer || 3600);
    }
  },

  run_wallpaper_script: function (override) {
    const dir = Gio.file_new_for_path(this.wallpaper_path);
    if (
      dir.query_exists(null) &&
      this.wallpaper_path &&
      this.wallpaper_delay &&
      this.wallpaper_timer
    ) {
      const command =
        AppletDir +
        "/scripts/wallpaper_script.py" +
        ` ${this.wallpaper_path} ${
          override === "next" || override === "prev"
            ? override
            : this.wallpaper_delay
        }`;
      const outputs = backtick(command);
      this._lastTimeLabel = "";
      outputs.split("\n").forEach((output) => {
        if (output.startsWith("Last changed")) {
          this._lastTimeLabel = output;
        }
      });
    }
  },

  property_changed: function (key) {
    this._removeTimeout();
    if (key === "wallpaper_path") {
      if (this.wallpaper_path.startsWith("file://")) {
        this.wallpaper_path = this.wallpaper_path.slice("file://".length);
      }
    }
    // log(this[key]);
    if (this.wallpaper_timer) this._start_applet();
  },

  initialize_wallpaper_dir: function () {
    if (!this.wallpaper_path) {
      this.wallpaper_path = GLib.get_home_dir() + "/Pictures/wallpapers";
    }
  },

  _removeTimeout: function () {
    if (this._timeout) {
      Mainloop.source_remove(this._timeout);
      log(`Timeout removed`);
      this._timeout = null;
    }
  },

  _setTimeout: function (seconds) {
    /** Cancel current timeout in event of an error and try again shortly */
    this._removeTimeout();
    log(`Setting timeout (${seconds}s)`);
    this._timeout = Mainloop.timeout_add_seconds(
      seconds,
      Lang.bind(this, this._start_applet)
    );
  },

  initMenu: function (orientation) {
    // The menu manager closes the menu after focus has changed.
    // Without adding the menu to the menu manager, the menu would stay open
    // until the user clicked on the applet again.
    this.menuManager = new PopupMenu.PopupMenuManager(this);

    // Create the menu
    this.menu = new Applet.AppletPopupMenu(this, orientation);

    // Add the menu to the menu manager
    this.menuManager.addMenu(this.menu);
    this.buildMenu();
  },

  buildMenu() {
    this.menu.removeAll();
    const dir = Gio.file_new_for_path(this.wallpaper_path);
    if (!dir.query_exists(null)) {
      let notExistsLabelItem = new PopupMenu.PopupMenuItem(
        _("The wallpaper path does not exists!")
      );
      notExistsLabelItem.connect(
        "activate",
        Lang.bind(this, () => {
          this.open_settings();
        })
      );
      this.menu.addMenuItem(notExistsLabelItem);
      return;
    }
    // Create the "delay" label
    let delayLabel = new PopupMenu.PopupMenuItem(
      _("Delay") + `: ${formatTime(Number(this.wallpaper_delay))}`
    );
    delayLabel.connect(
      "activate",
      Lang.bind(this, () => {
        this.open_settings();
      })
    );
    this.menu.addMenuItem(delayLabel);
    if (this._lastTimeLabel) {
      let labelItem = new PopupMenu.PopupMenuItem(_(this._lastTimeLabel), {
        reactive: false,
      });
      this.menu.addMenuItem(labelItem);
    }

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    let nextMenuItem = new PopupMenu.PopupMenuItem(_("Next"));
    nextMenuItem.connect(
      "activate",
      Lang.bind(this, () => {
        this.wallpaper_paused = false;
        this._start_applet("next");
      })
    );
    this.menu.addMenuItem(nextMenuItem);
    let prevMenuItem = new PopupMenu.PopupMenuItem(_("Previous"));
    prevMenuItem.connect(
      "activate",
      Lang.bind(this, () => {
        this.wallpaper_paused = false;
        this._start_applet("prev");
      })
    );
    this.menu.addMenuItem(prevMenuItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    let pauseMenuItem = new PopupMenu.PopupSwitchMenuItem(
      _("Paused"),
      this.wallpaper_paused
    );
    pauseMenuItem.connect(
      "toggled",
      Lang.bind(this, (item) => {
        this.wallpaper_paused = item.state;
        this._start_applet();
      })
    );
    this.menu.addMenuItem(pauseMenuItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    let settingsItem = new PopupMenu.PopupMenuItem(_("Preferences"));
    settingsItem.connect(
      "activate",
      Lang.bind(this, () => {
        this.open_settings();
      })
    );
    this.menu.addMenuItem(settingsItem);
  },

  destroy: function () {
    this._removeTimeout();
  },
  on_applet_removed_from_panel() {
    this._removeTimeout();
  },
};

function main(metadata, orientation, panel_height, instance_id) {
  return new WallpaperChanger(orientation, panel_height, instance_id);
}
