"use client";

import { forwardRef, InputHTMLAttributes, useState } from "react";

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  showPasswordToggle?: boolean;
}

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, showPasswordToggle, type, className = "", ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    const resolvedType = showPasswordToggle ? (visible ? "text" : "password") : type;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-[13px] font-medium text-ink/70">{label}</label>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={resolvedType}
            className={[
              "w-full bg-canvas border border-hairline rounded-md px-4 py-2.5",
              "text-[14px] text-ink placeholder-ink/35 outline-none",
              "transition-all duration-200",
              "focus:border-ink focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]",
              error ? "border-red-400 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.15)]" : "",
              showPasswordToggle ? "pr-11" : "",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            {...props}
          />

          {/* Password toggle eye icon */}
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors cursor-pointer"
              aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            >
              {visible ? (
                // Eye-off icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                // Eye icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
        </div>

        {error && (
          <p className="text-[12px] text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

InputField.displayName = "InputField";

export default InputField;