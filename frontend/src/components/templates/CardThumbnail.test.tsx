import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CardThumbnail } from './CardThumbnail'

const original = 'https://i.ytimg.com/vi/zgNvts_2TUE/maxresdefault.jpg'

it('serves a small direct cover and retries the original through Next on failure', () => {
  const onError = vi.fn()
  render(<CardThumbnail src={original} alt="Cover" width={120} height={90} onError={onError} />)
  const image = screen.getByRole('img')
  expect(image).toHaveAttribute('src', original.replace('maxresdefault', 'mqdefault'))
  expect(image).not.toHaveAttribute('srcset')
  fireEvent.error(image)
  expect(image.getAttribute('src')).toContain(encodeURIComponent(original))
  expect(onError).not.toHaveBeenCalled()
  fireEvent.error(image)
  expect(onError).toHaveBeenCalledOnce()
})

it.each([original + '?signature=abc', original.replace('maxresdefault', '1')])(
  'preserves the original source for %s', (src) => {
    render(<CardThumbnail src={src} alt="Cover" width={120} height={90} />)
    expect(screen.getByRole('img').getAttribute('src')).toContain(encodeURIComponent(src))
  },
)
