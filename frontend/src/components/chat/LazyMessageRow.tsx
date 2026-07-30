import dynamic from 'next/dynamic'

export const preloadMessageRow = () => import('./MessageRow')

export const LazyMessageRow = dynamic(
  () => import('./MessageRow').then(module => module.MessageRow),
  { loading: () => null }
)
