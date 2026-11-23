import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useToast } from "../../context/ToastContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";

export function ConversationMenu({ userId, name, onBlocked }: {
  userId: number;
  name: string;
  onBlocked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { notify } = useToast();

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const block = async () => {
    setBlocking(true);
    try {
      await api.relationships.block(userId);
      notify("User blocked. This conversation is now closed.", "success");
      onBlocked();
      navigate("/chat", { replace: true });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to block this user.", "error");
    } finally {
      setBlocking(false);
    }
  };

  return (
    <>
      <div className="conversation-menu" ref={container} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}>
        <button ref={trigger} type="button" className="icon-button" aria-label="Conversation options"
          aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="conversation-menu__dots" aria-hidden="true">•••</span>
        </button>
        {open ? <div className="conversation-menu__panel" role="menu" aria-label="Conversation options">
          <button ref={item} type="button" role="menuitem" onClick={() => {
            trigger.current?.focus();
            setOpen(false);
            setConfirming(true);
          }}><Icon name="block" size={18} /> Block user</button>
        </div> : null}
      </div>
      <Modal open={confirming} onClose={() => { if (!blocking) setConfirming(false); }}
        title={`Block ${name}?`} description="This hides both profiles from each other and closes your chat."
        size="sm" footer={<>
          <Button variant="ghost" disabled={blocking} onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="danger" loading={blocking} onClick={() => void block()}>Block user</Button>
        </>}>
        <p className="text-muted">You can undo this later from Account settings.</p>
      </Modal>
    </>
  );
}
