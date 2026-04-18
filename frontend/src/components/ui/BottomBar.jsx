import React from 'react'

export default function BottomBar({ children }) {
  return (
    <div className="bottom-bar" role="toolbar">
      <div className="bottom-bar-inner">{children}</div>
    </div>
  )
}
