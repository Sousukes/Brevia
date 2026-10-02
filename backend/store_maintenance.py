"""聚焦存储职责的组件。"""

import json
import shutil


def _is_file(path):
    """判断是否为普通文件；路径在扫描期间消失时按「不是文件」处理。"""
    try:
        return path.is_file()
    except OSError:
        return False


def _safe_size(path):
    """读取文件大小；文件在扫描期间消失时返回 0。"""
    try:
        return path.stat().st_size
    except OSError:
        return 0


class MaintenanceStoreMixin:
    def usage(self):
        """统计会议、模型与导出文件占用的字节数及其根目录。"""

        def size(root):
            """累计目录内普通文件的字节数。"""
            total = 0
            for path in root.rglob("*"):
                try:
                    if path.is_file():
                        total += path.stat().st_size
                except OSError:
                    # 扫描期间文件被并发删除/移动是正常现象，跳过即可，不要让统计失败。
                    continue
            return total

        return {
            "meetings": size(self.meetings_dir),
            "models": size(self.models_dir),
            "exports": sum(
                _safe_size(path)
                for path in self.meetings_dir.glob("*/exports/*")
                if _is_file(path)
            ),
            "root": str(self.root),
            "models_root": str(self.models_dir),
        }

    def metrics(self, app_duration_ms=0):
        """累计本地使用时长并返回会议内容统计。"""
        with self.connect() as db:
            row = db.execute(
                "SELECT value FROM app_meta WHERE key='metrics'"
            ).fetchone()
            value = json.loads(row["value"]) if row else {"app_duration_ms": 0}
            value["app_duration_ms"] += max(0, int(app_duration_ms))
            db.execute(
                "INSERT OR REPLACE INTO app_meta(key,value) VALUES('metrics',?)",
                (json.dumps(value),),
            )
            value["meeting_duration_ms"] = db.execute(
                "SELECT COALESCE(SUM(duration_ms),0) AS total FROM meetings WHERE deleted_at IS NULL"
            ).fetchone()["total"]
            # 同一场会议的精修段落（postprocess）会与实时段落（live）同时留存；
            # 直接 COUNT(*) 会把两者相加、指标虚高一倍。这里在有精修版本时排除 live，
            # 与展示/导出所用的 latest_segments「精修覆盖实时」保持一致。
            value["subtitle_count"] = db.execute(
                "SELECT COUNT(*) AS total FROM segments s "
                "WHERE s.version != 'live' OR NOT EXISTS ("
                "  SELECT 1 FROM segments r WHERE r.meeting_id = s.meeting_id "
                "  AND r.version LIKE 'postprocess%')"
            ).fetchone()["total"]
            value["subtitle_lines"] = db.execute(
                "SELECT COALESCE(SUM(LENGTH(text)-LENGTH(REPLACE(text, char(10),''))+1),0) AS total "
                "FROM segments s "
                "WHERE s.version != 'live' OR NOT EXISTS ("
                "  SELECT 1 FROM segments r WHERE r.meeting_id = s.meeting_id "
                "  AND r.version LIKE 'postprocess%')"
            ).fetchone()["total"]
            summaries = [
                row["data"]
                for row in db.execute(
                    "SELECT data FROM summaries WHERE data IS NOT NULL"
                )
            ]
            value["summary_count"] = len(summaries)
            value["summary_characters"] = sum(
                len(json.loads(item).get("markdown", "")) for item in summaries
            )
        return value

    def clear_storage_partition(self, partition):
        """清理一个明确的本地存储分区。"""
        if partition == "meetings":
            with self.connect() as db:
                db.execute("DELETE FROM meetings")
            shutil.rmtree(self.meetings_dir, ignore_errors=True)
            self.meetings_dir.mkdir(exist_ok=True)
        elif partition == "models":
            shutil.rmtree(self.models_dir, ignore_errors=True)
            self.models_dir.mkdir(parents=True, exist_ok=True)
        elif partition == "exports":
            for directory in self.meetings_dir.glob("*/exports"):
                shutil.rmtree(directory, ignore_errors=True)
        else:
            raise ValueError("Unknown storage partition")
        return self.usage()

    def cleanup_orphan_meeting_dirs(self):
        """只删除带匹配 Brevia manifest、但数据库不存在的会议目录。"""
        with self.connect() as db:
            meeting_ids = {row["id"] for row in db.execute("SELECT id FROM meetings")}
        removed, freed_bytes = [], 0
        for path in self.meetings_dir.iterdir():
            manifest = path / "manifest.json"
            if not path.is_dir() or path.name in meeting_ids or not manifest.is_file():
                continue
            try:
                if json.loads(manifest.read_text(encoding="utf-8")).get("meeting_id") != path.name:
                    continue
            except (OSError, json.JSONDecodeError):
                continue
            freed_bytes += sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
            shutil.rmtree(path)
            removed.append(path.name)
        return {"removed": removed, "freed_bytes": freed_bytes}
