import { useEffect, useState } from 'react'

export default function useResponsive() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isMobile = width < 768
  const isTablet = width >= 768 && width <= 1024
  const isDesktop = width > 1024

  return { width, isMobile, isTablet, isDesktop }
}
