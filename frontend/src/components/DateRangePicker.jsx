import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, startOfDay, endOfDay } from "date-fns";
import "react-day-picker/style.css";

function formatRange(range) {
  if (!range?.from) return "Custom dates";
  if (!range.to) return format(range.from, "MMM d");
  if (range.from.getFullYear() === range.to.getFullYear())
    return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
  return `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
}

export function DateRangePicker({ value, onChange, onClear }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? undefined);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Keep draft in sync if parent clears the value
  useEffect(() => {
    if (!value) setDraft(undefined);
  }, [value]);

  function apply() {
    if (!draft?.from) return;
    // If user only picked one date, use it as a single-day range
    const to = draft.to ?? draft.from;
    onChange({ from: startOfDay(draft.from), to: endOfDay(to) });
    setOpen(false);
  }

  function clear() {
    setDraft(undefined);
    onClear();
    setOpen(false);
  }

  const isActive = Boolean(value?.from);

  return (
    <div className="rdp-wrapper" ref={ref}>
      <button
        className={`range-tab ${isActive ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {isActive ? formatRange(value) : "📅 Custom"}
      </button>

      {open && (
        <div className="rdp-popover">
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={setDraft}
            disabled={{ after: new Date() }}
            defaultMonth={value?.to ?? new Date()}
          />
          <div className="rdp-actions">
            <button className="rdp-btn-clear" onClick={clear}>
              Clear
            </button>
            <button
              className="rdp-btn-apply"
              onClick={apply}
              disabled={!draft?.from}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
