import { useEffect, useState } from 'preact/hooks'

const listeners = new Set()

export function navigate(path) {
  history.pushState(null, '', path)
  listeners.forEach((fn) => fn())
}

export function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const sync = () => setPath(location.pathname)
    listeners.add(sync)
    addEventListener('popstate', sync)
    return () => {
      listeners.delete(sync)
      removeEventListener('popstate', sync)
    }
  }, [])
  return path
}

// <a> real (se puede abrir en otra pestaña) pero navega sin recargar con un toque normal.
export function Link({ href, onClick, ...rest }) {
  const go = (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    navigate(href)
    onClick?.(e)
  }
  return <a href={href} onClick={go} {...rest} />
}
