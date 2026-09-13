'use client'

import { useEffect, useState } from 'react'

type Permission = NotificationPermission | 'unsupported'

/** The device-notification switch, as a setting: what it does, where it stands, one button. */
export function NotificationSetting() {
  const [permission, setPermission] = useState<Permission>('default')
  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])
  async function enable() {
    if (typeof Notification === 'undefined') return
    setPermission(await Notification.requestPermission())
  }
  return (
    <div className="setting-row">
      <div>
        <p className="setting-name">Device notifications</p>
        <p className="setting-hint">
          Only for a loop that needs a decision now, and only while this tab is hidden. Everything
          else waits quietly in the bell.
        </p>
      </div>
      {permission === 'granted' && <span className="setting-state">On for this device</span>}
      {permission === 'denied' && (
        <span className="setting-state">Blocked in your browser settings</span>
      )}
      {permission === 'unsupported' && (
        <span className="setting-state">Not supported by this browser</span>
      )}
      {permission === 'default' && (
        <button type="button" className="setting-button" onClick={enable}>
          Turn on
        </button>
      )}
    </div>
  )
}
