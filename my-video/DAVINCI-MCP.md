# DaVinci Resolve Studio + MCP (تشغيل على جهازك)

المصدر: https://github.com/samuelgursky/davinci-resolve-mcp (رخصة MIT)

## المتطلبات
- DaVinci Resolve **18.5 أو أحدث** (نسخة Studio)
- Python 3.10 – 3.12
- اختياري: ffmpeg, numpy, librosa, whisper (للتحليل المتقدم)

## الخطوات

1. نزّل Resolve Studio من blackmagicdesign.com وفعّل الترخيص.
2. في Resolve: `Preferences > General > External scripting using` ← اختار **Local**، وبعدين أعد تشغيل Resolve.
3. نزّل الـ MCP server وركّبه (أسرع طريقة):
   ```bash
   npx davinci-resolve-mcp setup
   ```
   أو من الكود:
   ```bash
   git clone https://github.com/samuelgursky/davinci-resolve-mcp.git
   cd davinci-resolve-mcp
   python install.py
   ```
   الـ installer بيكتشف Python ومسار Resolve، وبيعمل virtual env، وبيضبط الـ client لوحده.
4. لو الضبط التلقائي ما اشتغلش، ضيف ده يدوي في `claude_desktop_config.json`:

   **macOS** (`~/Library/Application Support/Claude/claude_desktop_config.json`)
   ```json
   {
     "mcpServers": {
       "davinci-resolve": {
         "command": "/path/to/venv/bin/python",
         "args": ["/path/to/davinci-resolve-mcp/src/server.py"]
       }
     }
   }
   ```

   **Windows** (`%APPDATA%\Claude\claude_desktop_config.json`)
   ```json
   {
     "mcpServers": {
       "davinci-resolve": {
         "command": "C:\\path\\to\\venv\\Scripts\\python.exe",
         "args": ["C:\\path\\to\\davinci-resolve-mcp\\src\\server.py"]
       }
     }
   }
   ```
   **Claude Code:** `claude mcp add davinci-resolve -- /path/to/venv/bin/python /path/to/davinci-resolve-mcp/src/server.py`

5. شغّل Resolve **قبل** ما تستخدم الـ MCP، وأعد تشغيل Claude.

## ملاحظات
- `TimelineItem.CopyGrades` بيمسح شغل التلوين السابق من غير رجوع، والـ server بيرفضها إلا مع `acknowledge_trap: true`.
- الـ server ما بيعدّلش ملفات الميديا الأصلية.
- النسخة المجانية: السكريبت الخارجي للـ Studio بس. للمجانية استخدم `python scripts/install_resolve_bridge.py` وبعدين `Workspace > Scripts > resolve_bridge`.

## تكامل مع Remotion
Remotion يعمل الجرافيكس والنصوص والترجمة (`npx remotion render` ← ملف في `out/`)، وبعدين تستورد الناتج في Resolve للقص والتلوين والصوت.
