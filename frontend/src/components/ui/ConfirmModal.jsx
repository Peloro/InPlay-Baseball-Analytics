import React from 'react'
import Modal from './Modal'
import Button from './Button'

export default function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <Modal title="Confirmação" onClose={onCancel}>
      <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
