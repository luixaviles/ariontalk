import { css } from 'lit';

export const sharedStyles = css`
  :host {
    font-family: var(--vcw-font-family, system-ui, sans-serif);
    color: var(--vcw-text-color, #1F2937);
  }

  /* Animations */
  @keyframes vcw-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.08); opacity: 0.85; }
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
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes vcw-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }

  /* Shared button reset */
  button {
    border: none;
    cursor: pointer;
    font-family: var(--vcw-font-family, system-ui, sans-serif);
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible {
    outline: 2px solid var(--vcw-primary-color, #4F46E5);
    outline-offset: 2px;
  }
`;
