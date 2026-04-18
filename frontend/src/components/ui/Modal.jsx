import React from 'react'
import ReactDOM from 'react-dom'
import Button from './Button'

export default function Modal({ title, children, onClose }) {
  if (typeof document === 'undefined') return null

  return ReactDOM.createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="player-stats-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="player-stats-head">
          <h3>{title}</h3>
          <Button type="button" variant="primary" className="modal-close-btn" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
