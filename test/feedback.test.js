import { describe, expect, test } from 'vitest'
import { sendFeedback, deviceInfo } from '../src/lib/feedback.js'

const client = (result) => {
  const calls = []
  return { calls, rpc: async (fn, args) => (calls.push([fn, args]), result) }
}

describe('sendFeedback', () => {
  test('llama a send_feedback con el texto recortado, el autor, la pantalla y el navegador', async () => {
    const c = client({ error: null })
    await sendFeedback(c, '  se cortó el mapa  ', 'Nacho', 'mapa', 'UA')
    expect(c.calls).toEqual([['send_feedback', { p_body: 'se cortó el mapa', p_author: 'Nacho', p_page: 'mapa', p_user_agent: 'UA' }]])
  })
  test('traduce los errores de la base a un tipo', async () => {
    await expect(sendFeedback(client({ error: { message: 'too_many' } }), 'x', 'N', null, '')).rejects.toMatchObject({ kind: 'too_many' })
    await expect(sendFeedback(client({ error: { message: 'invalid_feedback' } }), 'x', 'N', null, '')).rejects.toMatchObject({ kind: 'invalid_feedback' })
    await expect(sendFeedback(client({ error: { message: 'Failed to fetch' } }), 'x', 'N', null, '')).rejects.toMatchObject({ kind: 'network' })
    await expect(sendFeedback({ rpc: async () => { throw new TypeError('Failed to fetch') } }, 'x', 'N', null, '')).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('deviceInfo', () => {
  test('says how the app is running, for reading the feedback', () => {
    expect(deviceInfo({ installed: true, persisted: false, usageBytes: 226e6, loadMs: 1840 }))
      .toBe('app:icono protegido:no usado:226MB carga:1.8s')
  })
  test('marks with ? what the phone does not report', () => {
    expect(deviceInfo({ installed: false })).toBe('app:navegador protegido:? usado:? carga:?')
  })
})
