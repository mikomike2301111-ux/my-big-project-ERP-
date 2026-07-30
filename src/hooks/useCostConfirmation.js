import { useState, useCallback } from 'react';
import React from 'react';

/**
 * useCostConfirmation — Reusable hook for cost confirmation overlays
 * 
 * Returns:
 *   requestConfirmation(entity, field, warningMessage) → Promise<boolean>
 *   ConfirmationOverlay — React component to render in the parent
 */
export function useCostConfirmation() {
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const requestConfirmation = useCallback((entity, field, warningMessage) => {
    return new Promise((resolve) => {
      setPendingConfirm({
        entity,
        field,
        warningMessage,
        resolve
      });
    });
  }, []);

  const clearConfirmation = useCallback(() => {
    setPendingConfirm(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (pendingConfirm) {
      pendingConfirm.resolve(true);
      setPendingConfirm(null);
    }
  }, [pendingConfirm]);

  const handleCancel = useCallback(() => {
    if (pendingConfirm) {
      pendingConfirm.resolve(false);
      setPendingConfirm(null);
    }
  }, [pendingConfirm]);

  const ConfirmationOverlay = pendingConfirm ? (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal-card cost-confirmation-modal" onClick={e => e.stopPropagation()}>
        <header>
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f79009" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Confirm Price
          </h2>
          <button type="button" onClick={handleCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="cost-confirmation-body">
          <div className="cost-confirmation-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M8 10c0-1.1.9-2 2-2h4a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2" />
            </svg>
          </div>

          <p className="cost-confirmation-question">
            Are you sure the price is correct?
          </p>

          <div className="cost-confirmation-details">
            <div className="cost-detail-row">
              <span>Entity</span>
              <strong>{pendingConfirm.entity?.name || '—'}</strong>
            </div>
            <div className="cost-detail-row">
              <span>Type</span>
              <strong>{pendingConfirm.entity?.type || '—'}</strong>
            </div>
            <div className="cost-detail-row highlight">
              <span>{pendingConfirm.field?.label || 'Price'}</span>
              <strong>KES {Number(pendingConfirm.field?.value || 0).toLocaleString()}</strong>
            </div>
          </div>

          {pendingConfirm.warningMessage && (
            <div className="cost-confirmation-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{pendingConfirm.warningMessage}</span>
            </div>
          )}

          <p className="cost-confirmation-hint">
            This price will be used for cost calculations across the system. 
            Please verify it is accurate before confirming.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="primary-action" onClick={handleConfirm}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Confirm Price
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { requestConfirmation, ConfirmationOverlay, clearConfirmation };
}