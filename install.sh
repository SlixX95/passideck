#!/bin/bash
# TermDeck Installer
# Creates a double-clickable macOS app, desktop shortcut, and optional login item

set -e

TERMDECK_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="TermDeck"
APP_DIR="$HOME/Applications/$APP_NAME.app"
ICON_DIR="$APP_DIR/Contents/Resources"
MACOS_DIR="$APP_DIR/Contents/MacOS"

echo ""
echo "  TermDeck Installer"
echo "  =================="
echo ""

# Step 1: Install dependencies if needed
if [ ! -d "$TERMDECK_DIR/node_modules" ]; then
  echo "  [1/4] Installing dependencies..."
  cd "$TERMDECK_DIR" && npm install
else
  echo "  [1/4] Dependencies already installed"
fi

# Step 2: Create macOS .app bundle
echo "  [2/4] Creating $APP_NAME.app..."

mkdir -p "$MACOS_DIR" "$ICON_DIR"

# Launcher script inside the .app
cat > "$MACOS_DIR/$APP_NAME" << LAUNCHER
#!/bin/bash
# TermDeck launcher - starts server and opens browser
export PATH="/usr/local/bin:/opt/homebrew/bin:\$PATH"

# Find node
NODE=\$(which node 2>/dev/null)
if [ -z "\$NODE" ]; then
  # Try common locations
  for p in /usr/local/bin/node /opt/homebrew/bin/node \$HOME/.nvm/versions/node/*/bin/node; do
    if [ -x "\$p" ]; then NODE="\$p"; break; fi
  done
fi

if [ -z "\$NODE" ]; then
  osascript -e 'display alert "TermDeck" message "Node.js not found. Install it from https://nodejs.org" as critical'
  exit 1
fi

# Start TermDeck
cd "$TERMDECK_DIR"
exec "\$NODE" packages/cli/src/index.js "\$@"
LAUNCHER
chmod +x "$MACOS_DIR/$APP_NAME"

# Info.plist
cat > "$APP_DIR/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>TermDeck</string>
    <key>CFBundleDisplayName</key>
    <string>TermDeck</string>
    <key>CFBundleIdentifier</key>
    <string>com.termdeck.app</string>
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleExecutable</key>
    <string>TermDeck</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Copy icon
if [ -f "$TERMDECK_DIR/assets/TermDeck.icns" ]; then
  cp "$TERMDECK_DIR/assets/TermDeck.icns" "$ICON_DIR/AppIcon.icns"
fi

echo "  [3/4] App created at ~/Applications/$APP_NAME.app"

# Step 3: Create config directory
mkdir -p "$HOME/.termdeck"
if [ ! -f "$HOME/.termdeck/config.yaml" ]; then
  cp "$TERMDECK_DIR/config/config.example.yaml" "$HOME/.termdeck/config.yaml"
  echo "  [4/4] Config created at ~/.termdeck/config.yaml"
else
  echo "  [4/4] Config already exists"
fi

echo ""
echo "  Done! You can now:"
echo ""
echo "    1. Double-click ~/Applications/TermDeck.app"
echo "    2. Add it to your Dock (drag from ~/Applications)"
echo "    3. Set it as a Login Item (System Settings > General > Login Items)"
echo ""
echo "  Or from a terminal:  npm run dev"
echo "  Or:                  node packages/cli/src/index.js"
echo ""
