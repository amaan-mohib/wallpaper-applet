const Applet = imports.ui.applet;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

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

const SettingsMap = {
  wallpaper_delay: "Delay",
  wallpaper_path: "Wallpapers path",
  wallpaper_timer: "Timer (interval to check for updates)",
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
    this._start_applet();
  },

  on_applet_clicked: function () {
    Util.spawnCommandLine(CMD_SETTINGS);
  },

  _start_applet: function () {
    this.run_wallpaper_script();
    this._setTimeout(this.wallpaper_timer || 3600);
  },

  run_wallpaper_script: function () {
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
        ` ${this.wallpaper_path} ${this.wallpaper_delay}`;
      // log(command);
      Util.spawnCommandLine(command);
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
