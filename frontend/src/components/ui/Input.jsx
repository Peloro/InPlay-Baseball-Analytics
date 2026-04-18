import React from 'react'

export default function Input({ className = '', ...props }) {
  const cls = ['text-input', className].filter(Boolean).join(' ')
  return <input className={cls} {...props} />
}
