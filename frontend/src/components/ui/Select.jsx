import React from 'react'

export default function Select({ className = '', ...props }) {
  const cls = ['select-input', className].filter(Boolean).join(' ')
  return <select className={cls} {...props} />
}
