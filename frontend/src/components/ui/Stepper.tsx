/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React from "react";
import { Check, AlertCircle } from "lucide-react";

export interface StepItem {
  id: string | number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

interface StepperProps {
  steps: StepItem[];
  activeStep: number; // 0-indexed
  onStepClick?: (stepIndex: number) => void;
  allowStepClick?: boolean;
  orientation?: "horizontal" | "vertical";
  variant?: "default" | "compact" | "pills";
  errorStep?: number;
  className?: string;
}

export function Stepper({
  steps,
  activeStep,
  onStepClick,
  allowStepClick = false,
  orientation = "horizontal",
  variant = "default",
  errorStep,
  className = "",
}: StepperProps) {
  // Mobile / Compact View
  if (variant === "compact") {
    const current = steps[activeStep] || steps[0];
    const progressPercent = Math.round(((activeStep + 1) / steps.length) * 100);

    return (
      <div className={`w-full bg-card border border-border/70 rounded-2xl p-4 shadow-2xs ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-right">
            <span className="text-xs font-bold text-primary">
              الخطوة {activeStep + 1} من {steps.length}
            </span>
            <h4 className="text-sm font-extrabold text-foreground mt-0.5">{current.title}</h4>
          </div>
          {current.description && (
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              {current.description}
            </span>
          )}
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  // Vertical Stepper
  if (orientation === "vertical") {
    return (
      <div className={`space-y-4 ${className}`} role="list" aria-label="مراحل الإجراء">
        {steps.map((step, idx) => {
          const isCompleted = idx < activeStep;
          const isCurrent = idx === activeStep;
          const isError = errorStep === idx;
          const isClickable = allowStepClick && (isCompleted || idx <= activeStep + 1);

          return (
            <div
              key={step.id}
              className={`flex items-start gap-3.5 relative ${
                idx < steps.length - 1 ? "pb-6" : ""
              }`}
              role="listitem"
            >
              {/* Connecting line */}
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-8 right-4 w-0.5 -bottom-2 transition-colors ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}

              {/* Step indicator circle */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(idx)}
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all shadow-2xs ${
                  isError
                    ? "bg-rose-500 text-white ring-4 ring-rose-100 dark:ring-rose-950"
                    : isCompleted
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : isCurrent
                    ? "bg-primary/10 text-primary border-2 border-primary ring-4 ring-primary/10"
                    : "bg-muted text-muted-foreground"
                } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </button>

              {/* Title & Description */}
              <div className="flex-1 pt-0.5 text-right">
                <div
                  className={`text-sm font-bold transition-colors ${
                    isCurrent
                      ? "text-primary"
                      : isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Horizontal Stepper (Default)
  return (
    <div className={`w-full ${className}`} role="list" aria-label="مراحل الإجراء">
      <div className="flex items-center justify-between relative">
        {steps.map((step, idx) => {
          const isCompleted = idx < activeStep;
          const isCurrent = idx === activeStep;
          const isError = errorStep === idx;
          const isClickable = allowStepClick && (isCompleted || idx <= activeStep + 1);

          return (
            <React.Fragment key={step.id}>
              {/* Step node */}
              <div className="flex flex-col items-center relative z-10" role="listitem">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick?.(idx)}
                  className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-xs sm:text-sm font-bold transition-all shadow-2xs ${
                    isError
                      ? "bg-rose-500 text-white ring-4 ring-rose-100 dark:ring-rose-950"
                      : isCompleted
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : isCurrent
                      ? "bg-primary/15 text-primary border-2 border-primary ring-4 ring-primary/15"
                      : "bg-muted text-muted-foreground border border-border/80"
                  } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isError ? (
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : isCompleted ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.8]" />
                  ) : step.icon ? (
                    step.icon
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </button>

                <div className="mt-2 text-center max-w-[90px] sm:max-w-[120px]">
                  <div
                    className={`text-[11px] sm:text-xs font-bold truncate ${
                      isCurrent
                        ? "text-primary font-black"
                        : isCompleted
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </div>
                  {step.description && (
                    <div className="text-[10px] text-muted-foreground hidden sm:block truncate mt-0.5">
                      {step.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Connecting line between steps */}
              {idx < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 -mt-6 sm:-mt-7 bg-muted relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isCompleted ? "bg-primary w-full" : "w-0"
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default Stepper;
