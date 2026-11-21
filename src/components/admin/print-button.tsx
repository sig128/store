"use client";

export function PrintButton() {
  return (
    <div className="no-print mb-6 flex gap-2">
      <button type="button" className="a-btn a-btn-primary" onClick={() => window.print()}>
        Print
      </button>
      <button type="button" className="a-btn" onClick={() => window.history.back()}>
        Back
      </button>
    </div>
  );
}
