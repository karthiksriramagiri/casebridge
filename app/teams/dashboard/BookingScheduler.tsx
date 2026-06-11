'use client'
import { useState, useEffect } from 'react'
import { format, isSameDay } from 'date-fns'

function nextHalfHour(date: Date): Date {
  const ms = date.getTime()
  return new Date(Math.ceil(ms / (30 * 60 * 1000)) * (30 * 60 * 1000))
}

function generateSlots(now: Date): Date[] {
  const earliest = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const latest = new Date(now.getTime() + 12 * 60 * 60 * 1000)
  const start = nextHalfHour(earliest)
  const slots: Date[] = []
  let cur = new Date(start)
  while (cur <= latest) {
    slots.push(new Date(cur))
    cur = new Date(cur.getTime() + 30 * 60 * 1000)
  }
  return slots
}

export default function BookingScheduler({ serverNow }: { serverNow: string }) {
  const [slots, setSlots] = useState<Date[]>([])
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set())
  const [myBooking, setMyBooking] = useState<string | null>(null)
  const [selected, setSelected] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const now = new Date(serverNow)
    setSlots(generateSlots(now))

    fetch('/api/teams/booking')
      .then((r) => r.json())
      .then((data) => {
        setBookedSlots(new Set(data.bookedSlots ?? []))
        setMyBooking(data.myBooking ?? null)
      })
      .finally(() => setLoading(false))
  }, [serverNow])

  async function handleBook() {
    if (!selected) return
    setConfirming(true)
    setError('')
    const res = await fetch('/api/teams/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotTime: selected.toISOString() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to book. Please try again.')
      setConfirming(false)
      return
    }
    setMyBooking(data.slotTime)
    setConfirming(false)
  }

  // Group slots by day
  const grouped: { day: Date; slots: Date[] }[] = []
  for (const slot of slots) {
    const last = grouped[grouped.length - 1]
    if (last && isSameDay(last.day, slot)) {
      last.slots.push(slot)
    } else {
      grouped.push({ day: slot, slots: [slot] })
    }
  }

  // Already booked — show confirmation
  if (myBooking) {
    return (
      <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-lg">✅</div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Call Booked!</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Your onboarding call is scheduled for{' '}
              <strong>{format(new Date(myBooking), "EEEE, MMMM d 'at' h:mm a")}</strong>.
            </p>
            <button
              onClick={() => setMyBooking(null)}
              className="text-xs text-gray-400 underline mt-2 hover:text-gray-600"
            >
              Reschedule
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-lg">📅</div>
        <div>
          <h3 className="font-bold text-gray-900 text-base">Book Your Onboarding Call</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Level 1 complete! Pick a 30-min slot for your intro call. Level 2 will unlock automatically 30 minutes after your call starts.
            Slots available within the next 12 hours, starting 2 hours from now.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading available times…
        </div>
      ) : slots.length === 0 ? (
        <p className="text-sm text-gray-500">No slots available right now. Please check back shortly.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ day, slots: daySlots }) => (
            <div key={day.toISOString()}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {format(day, 'EEEE, MMMM d')}
              </p>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((slot) => {
                  const iso = slot.toISOString()
                  const taken = bookedSlots.has(iso)
                  const isSelected = selected?.toISOString() === iso
                  return (
                    <button
                      key={iso}
                      disabled={taken}
                      onClick={() => setSelected(isSelected ? null : slot)}
                      className={`text-sm font-medium px-4 py-2 rounded-lg border-2 transition-all ${
                        taken
                          ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                          : isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                          : 'border-blue-200 bg-white text-blue-800 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      {format(slot, 'h:mm a')}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {selected && (
            <div className="flex items-center gap-3 pt-2 border-t border-blue-200 mt-2">
              <p className="text-sm text-gray-700 flex-1">
                Booking <strong>{format(selected, "h:mm a 'on' EEEE, MMMM d")}</strong>
              </p>
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={confirming}
                className="bg-[#0f1e3c] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#1a3060] disabled:opacity-50 transition-colors"
              >
                {confirming ? 'Booking…' : 'Confirm'}
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
