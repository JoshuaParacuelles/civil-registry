import './db'
import './connectivity'
import './syncEngine'   // BAG-O

if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}