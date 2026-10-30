import { render } from 'preact'
import { App } from './app.jsx'
import { makeClient } from './lib/db.js'
import { startAutoFlush } from './lib/queue.js'
import './styles.css'

startAutoFlush(makeClient)
render(<App />, document.getElementById('app'))
