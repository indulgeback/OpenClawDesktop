#!/usr/bin/env python3
"""
YumFu Storybook Generator V3 - Full Conversation from Session Logs
Reads session JSONL logs and generates beautiful PDF-ready HTML storybook

Features:
- Complete conversation flow (player input + AI responses)
- Storybook-ready prose layer when available
- Images embedded inline as data URLs for chat-safe single-file HTML delivery
- Beautiful HTML/PDF layout
- Auto-detects most recent session

Usage:
    python3 generate_storybook_v3.py --user-id 1309815719 --universe warrior-cats
    python3 generate_storybook_v3.py --user-id 1309815719 --universe warrior-cats --session-id 20260403-001349
"""

import argparse
import base64
import json
import mimetypes
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class StorybookV3:
    def __init__(self, user_id: str, universe: str, session_id: str = None):
        self.user_id = user_id
        self.universe = universe
        self.base_path = Path.home() / "clawd/memory/yumfu"
        self.save_path = self.base_path / "saves" / universe / f"user-{user_id}.json"
        self.session_dir = self.base_path / "sessions" / universe / f"user-{user_id}"
        self.session_id = session_id or self._find_latest_session()
        self.session_file = self.session_dir / f"session-{self.session_id}.jsonl"

        if not self.session_file.exists():
            raise FileNotFoundError(f"Session log not found: {self.session_file}")

        if self.save_path.exists():
            with open(self.save_path, 'r', encoding='utf-8') as f:
                self.save_data = json.load(f)
        else:
            self.save_data = {"character": {"name": "Unknown Hero"}}

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        self.output_dir = self.base_path / "storybooks" / universe / f"user-{user_id}-{timestamp}"
        self.images_dir = self.output_dir / "images"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(exist_ok=True)

    def _find_latest_session(self) -> str:
        if not self.session_dir.exists():
            raise FileNotFoundError(f"No sessions found for user {self.user_id}")
        sessions = sorted(self.session_dir.glob("session-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not sessions:
            raise FileNotFoundError(f"No session logs found in {self.session_dir}")
        return sessions[0].stem.replace("session-", "")

    def load_session_log(self) -> List[Dict]:
        events = []
        with open(self.session_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    events.append(json.loads(line))
        return events

    def _resolve_image_path(self, image_ref: str) -> Optional[Path]:
        if not image_ref:
            return None

        ref_path = Path(image_ref)
        if ref_path.exists():
            return ref_path

        basename = ref_path.name
        search_roots = [
            Path.home() / ".openclaw/media/outbound/yumfu",
            Path.home() / ".openclaw/media/outbound",
            Path.home() / ".openclaw/media/tool-image-generation",
            Path.home() / "clawd/output",
        ]

        for root in search_roots:
            if not root.exists():
                continue
            exact = root / basename
            if exact.exists():
                return exact

        stem = Path(basename).stem.lower()
        stem_tokens = [tok for tok in stem.replace('_', '-').split('-') if tok]
        for root in search_roots:
            if not root.exists():
                continue
            for p in root.rglob('*'):
                if not p.is_file():
                    continue
                name = p.name.lower()
                p_stem = p.stem.lower()
                if basename.lower() == name:
                    return p
                if stem and (stem in p_stem or p_stem in stem):
                    return p
                if stem_tokens and sum(1 for tok in stem_tokens if tok in p_stem) >= max(2, min(4, len(stem_tokens))):
                    return p
        return None

    def collect_images(self, events: List[Dict]) -> Dict[str, Path]:
        image_map = {}
        for event in events:
            img_ref = event.get("image") or event.get("filename")
            if not img_ref:
                continue
            img_path = self._resolve_image_path(img_ref)
            if img_path and img_path.exists():
                dest = self.images_dir / img_path.name
                if not dest.exists():
                    shutil.copy2(img_path, dest)
                image_map[img_ref] = dest
        return image_map

    def _image_src(self, path: Path) -> str:
        mime, _ = mimetypes.guess_type(path.name)
        mime = mime or 'image/png'
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        return f'data:{mime};base64,{data}'

    def _scene_name(self, img_ref: str, fallback: str = "") -> str:
        if fallback:
            return fallback
        return Path(img_ref).stem.split('-', 2)[-1].replace('-', ' ').title()

    def generate_html(self, events: List[Dict], images: Dict[str, Path]) -> str:
        character = self.save_data.get("character", {})
        universe = self.save_data.get("universe", self.universe)
        world_titles = {
            "warrior-cats": "A Warrior Cats Tale",
            "xiaoao": "笑傲江湖传奇",
            "harry-potter": "A Hogwarts Adventure",
            "lotr": "A Middle-earth Chronicle",
            "game-of-thrones": "A Chronicle of Ice and Fire",
            "journey-to-west": "Journey to the West",
        }

        html = f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
  <title>{character.get('name', 'Hero')}'s Adventure</title>
  <style>
    @media print {{ body {{ margin: 0.5in; }} .no-print {{ display:none; }} .page-break {{ page-break-before: always; }} }}
    body {{ font-family: Georgia, serif; line-height: 1.8; max-width: 900px; margin: 2em auto; padding: 0 2em; color: #2c3e50; background: #f5f5f0; }}
    .container {{ background: white; padding: 3em; box-shadow: 0 2px 15px rgba(0,0,0,0.1); }}
    h1 {{ font-size: 2.8em; color: #1a1a1a; text-align: center; margin-bottom: 0.3em; border-bottom: 4px solid #d35400; padding-bottom: 0.5em; font-weight: bold; }}
    .meta {{ text-align: center; color: #7f8c8d; margin-bottom: 3em; font-style: italic; font-size: 1.1em; }}
    .turn {{ margin: 2em 0; border-left: 4px solid #3498db; padding-left: 1.5em; }}
    .player-input {{ color: #2980b9; font-weight: bold; margin-bottom: 0.35em; font-family: 'Courier New', monospace; font-size: 1em; }}
    .player-storybook {{ color: #5d6d7e; font-style: italic; margin-bottom: 0.8em; font-size: 1em; }}
    .ai-response {{ text-align: justify; line-height: 2; color: #34495e; margin-bottom: 1em; font-size: 1.05em; }}
    .event {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.2em; border-radius: 10px; margin: 2em 0; font-weight: bold; text-align: center; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); }}
    .dialogue {{ background: #fff9e6; border-left: 5px solid #f39c12; padding: 1.2em; margin: 1.5em 0; }}
    .dialogue-speaker {{ font-weight: bold; color: #e67e22; margin-bottom: 0.5em; }}
    .dialogue-text {{ color: #34495e; font-style: italic; }}
    .image-block {{ margin: 3em 0; text-align: center; page-break-inside: avoid; }}
    .image-block img {{ max-width: 100%; height: auto; border-radius: 15px; box-shadow: 0 8px 25px rgba(0,0,0,0.2); }}
    .image-caption {{ text-align: center; font-style: italic; color: #95a5a6; margin-top: 1em; font-size: 1em; }}
    .stats-box {{ background: #ecf0f1; padding: 2em; border-radius: 10px; margin: 2em 0; border: 2px solid #bdc3c7; page-break-inside: avoid; }}
    .stats-box h2 {{ margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5em; }}
    .stats-box ul {{ list-style: none; padding: 0; }}
    .stats-box li {{ padding: 0.5em 0; border-bottom: 1px solid #d5d8dc; }}
    .stats-box li:last-child {{ border-bottom: none; }}
    .print-btn {{ position: fixed; top: 30px; right: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 1em 2em; border-radius: 25px; cursor: pointer; font-size: 1.1em; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); z-index: 1000; }}
    .footer {{ text-align: center; margin-top: 4em; padding-top: 2em; border-top: 2px solid #bdc3c7; color: #95a5a6; font-size: 0.9em; }}
  </style>
</head>
<body>
  <button class=\"print-btn no-print\" onclick=\"window.print()\">📄 Print to PDF</button>
  <div class=\"container\">
    <h1>{character.get('name', 'Unknown Hero')}'s Adventure</h1>
    <div class=\"meta\">{world_titles.get(universe, 'An Epic Journey')}<br>
      <strong>World:</strong> {universe.replace('-', ' ').title()} &nbsp;|&nbsp;
      <strong>Rank:</strong> {character.get('rank', character.get('level', 'Apprentice'))} &nbsp;|&nbsp;
      <strong>Session:</strong> {self.session_id}
    </div>
    <div class=\"story-content\">"""

        for event in events:
            event_type = event.get("type")
            if event_type == "turn":
                player_input = event.get("player", "")
                player_storybook = event.get("player_storybook") or player_input
                ai_response = event.get("ai_storybook") or event.get("ai", "")
                img = event.get("image")
                html += f"""
      <div class=\"turn\">
        <div class=\"player-input\">▶️ {player_input}</div>
        <div class=\"player-storybook\">{player_storybook}</div>
        <div class=\"ai-response\">{ai_response}</div>
"""
                if img and img in images:
                    img_path = images[img]
                    html += f"""
        <div class=\"image-block\">
          <img src=\"{self._image_src(img_path)}\" alt=\"{self._scene_name(img)}\">
          <p class=\"image-caption\">🎨 {self._scene_name(img)}</p>
        </div>
"""
                html += "      </div>\n"
            elif event_type == "event":
                content = event.get("content", "")
                html += f'<div class="event">{content}</div>\n'
            elif event_type == "dialogue":
                speaker = event.get("speaker", "Unknown")
                content = event.get("content", "")
                img = event.get("image")
                html += f"""
      <div class=\"dialogue\">
        <div class=\"dialogue-speaker\">💬 {speaker}:</div>
        <div class=\"dialogue-text\">\"{content}\"</div>
      </div>
"""
                if img and img in images:
                    img_path = images[img]
                    html += f"""
      <div class=\"image-block\">
        <img src=\"{self._image_src(img_path)}\" alt=\"{self._scene_name(img)}\">
        <p class=\"image-caption\">🎨 {self._scene_name(img)}</p>
      </div>
"""
            elif event_type == "image":
                img = event.get("filename")
                description = event.get("description", "")
                if img and img in images:
                    img_path = images[img]
                    html += f"""
      <div class=\"image-block\">
        <img src=\"{self._image_src(img_path)}\" alt=\"{self._scene_name(img, description)}\">
        <p class=\"image-caption\">🎨 {self._scene_name(img, description)}</p>
      </div>
"""

        html += "</div>\n\n"
        html += """
      <div class=\"page-break\"></div>
      <div class=\"stats-box\">
        <h2>📊 Final Character Stats</h2>
        <ul>
"""
        attributes = character.get("attributes", {})
        for stat, value in attributes.items():
            html += f"<li><strong>{stat.replace('_', ' ').title()}:</strong> {value}</li>\n"
        html += "</ul>\n</div>\n"

        relationships = self.save_data.get("relationships", {})
        if relationships:
            html += """
      <div class=\"stats-box\">
        <h2>💝 Relationships</h2>
        <ul>
"""
            for npc, rel_data in relationships.items():
                if isinstance(rel_data, dict):
                    affection = rel_data.get("affection", 0)
                    status = rel_data.get("status", "Unknown")
                    html += f"<li><strong>{npc}</strong> (❤️ {affection}): {status}</li>\n"
            html += "</ul>\n</div>\n"

        achievements = self.save_data.get("achievements", [])
        if achievements:
            html += """
      <div class=\"stats-box\">
        <h2>🏆 Achievements Unlocked</h2>
        <ul>
"""
            for ach in achievements:
                html += f"<li>✨ {ach}</li>\n"
            html += "</ul>\n</div>\n"

        html += f"""
      <div class=\"footer\">
        <p><strong>YumFu Storybook Generator V3</strong><br>
        Complete conversation flow from session logs<br>
        Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
      </div>
    </div>
  </body>
</html>
"""
        return html

    def generate(self):
        print(f"📚 Generating Storybook V3 for {self.save_data.get('character', {}).get('name', 'Unknown')}...")
        print(f"   Session: {self.session_id}")
        print("📖 Loading session log...")
        events = self.load_session_log()
        print(f"   Found {len(events)} events")
        print("🎨 Collecting images...")
        images = self.collect_images(events)
        print(f"   Found {len(images)} images")
        print("✍️  Creating storybook...")
        html_content = self.generate_html(events, images)
        html_file = self.output_dir / "storybook.html"
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"\n🎉 Storybook complete!")
        print(f"📁 Location: {self.output_dir}")
        print(f"🌐 HTML: {html_file}")
        print(f"🖼️  Images: {len(images)} files")
        print(f"\n💡 Open in browser and print to PDF!")
        return html_file


def main():
    parser = argparse.ArgumentParser(description="Generate YumFu Storybook V3 from session logs")
    parser.add_argument("--user-id", required=True, help="User ID")
    parser.add_argument("--universe", required=True, help="World")
    parser.add_argument("--session-id", help="Optional session ID")
    args = parser.parse_args()

    try:
        generator = StorybookV3(user_id=args.user_id, universe=args.universe, session_id=args.session_id)
        html_file = generator.generate()
        try:
            import webbrowser
            webbrowser.open(f"file://{html_file}")
            print("\n🌐 Opened in browser!")
        except Exception:
            print(f"\n💡 Open manually: file://{html_file}")
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}")
        print(f"\n💡 Tip: Make sure session logs exist under ~/clawd/memory/yumfu/sessions/{args.universe}/user-{args.user_id}/")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
