import React from 'react'

export default function Button({ children, variant = 'primary', className = '', type = 'button', ...props }) {
  // Map variant to existing CSS classes used across the app to keep visual parity
  const variantClass =
    variant === 'primary' ? 'action-btn' :
    variant === 'secondary' ? 'secondary-btn' :
    variant === 'danger' ? 'danger-btn' :
    variant === 'link' ? 'link-btn' :
    variant === 'nav' ? 'nav-btn' :
    'action-btn'

  const cls = [variantClass, className].filter(Boolean).join(' ')

  return (
    <button type={type} className={cls} {...props}>
      {children}
    </button>
  )
}
