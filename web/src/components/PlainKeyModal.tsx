interface Props {
  plainKey: string;
  title?: string;
  onClose: () => void;
}

// Shows a freshly-issued/rotated plain key once. After closing it can never be retrieved again.
export default function PlainKeyModal({ plainKey, title, onClose }: Props) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainKey);
    } catch {
      /* clipboard may be blocked; user can select manually */
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title ?? "Key 已生成"}</h3>
        <div className="error" style={{ fontWeight: 600 }}>
          ⚠ 这是明文 key，仅显示一次，关闭后无法再次查看，请立即保存。
        </div>
        <div className="keybox">{plainKey}</div>
        <div className="actions">
          <button className="btn primary" onClick={copy}>复制</button>
          <button className="btn" onClick={onClose}>我已保存，关闭</button>
        </div>
      </div>
    </div>
  );
}
