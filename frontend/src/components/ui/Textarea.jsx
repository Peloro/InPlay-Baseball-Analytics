import React from 'react'

export default function Textarea({ className = '', ...props }) {
  const cls = ['textarea-input', className].filter(Boolean).join(' ')
  return <textarea className={cls} {...props} />
}
