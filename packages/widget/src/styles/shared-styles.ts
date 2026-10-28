import { css } from 'lit';

export const sharedStyles = css`
  :host {
    font-family: var(--at-font-family, system-ui, sans-serif);
    color: var(--at-text-color, #1F2937);
  }

  /* Animations */
  @keyframes vcw-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.08); opacity: 0.85; }
  }

  @keyframes vcw-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }

  @keyframes vcw-star {
    0%, 70%, 100% { opacity: 0.25; transform: scale(0.8); }
    35% { opacity: 1; transform: scale(1.15); }
  }

  @keyframes vcw-wave {
    0%, 100% { height: 8px; }
    50% { height: 20px; }
  }

  @keyframes vcw-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes vcw-fade-in {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes vcw-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes vcw-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Shared button reset */
  button {
    border: none;
    cursor: pointer;
    font-family: var(--at-font-family, system-ui, sans-serif);
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible {
    outline: 2px solid var(--at-primary-ui, var(--at-primary-color, #111827));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition: none !important;
    }
  }
`;
