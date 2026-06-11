'use client'
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'commission_notice_jun2026_acked'
const BANNER_EXPIRES = new Date('2026-06-17T00:00:00')

export default function CommissionNotice() {
  const [showModal, setShowModal] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const acked = localStorage.getItem(STORAGE_KEY) === 'true'
    const bannerActive = new Date() < BANNER_EXPIRES
    setShowModal(!acked)
    setShowBanner(bannerActive)
  }, [])

  function acknowledge() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShowModal(false)
  }

  return (
    <>
      {/* Sticky top banner — visible until June 17 */}
      {showBanner && (
        <div className="w-full bg-[#0f1e3c] border-b border-blue-900 px-4 py-2.5 flex items-center justify-center gap-3 text-sm text-white sticky top-0 z-40">
          <span className="text-yellow-400 shrink-0">📋</span>
          <span>
            <strong>Commission Structure Update:</strong> $30 per closed case. Replacement cases are not eligible.{' '}
            <button
              onClick={() => setShowModal(true)}
              className="underline text-blue-300 hover:text-white transition-colors"
            >
              View full notice
            </button>
          </span>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Panel */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-8 py-7">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Commission Structure Update</h2>

              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>We have updated our commission structure.</p>

                <p>
                  Effective moving forward, commissions will only be paid for cases that are
                  successfully closed.
                </p>

                <ul className="list-disc pl-5 space-y-1">
                  <li>Commission: <strong>$30 per closed case</strong></li>
                  <li>Replacement cases will <strong>not</strong> be eligible for commission payment.</li>
                </ul>

                <p>
                  The reason for this change is that a replacement means the PC was not fully closed
                  and qualified according to our criteria. It also means the PC was not properly
                  vetted regarding the importance of communication and treatment, which affects case
                  quality.
                </p>

                <p>
                  Our goal is to incentivize the team to focus on closing fully qualified,
                  high-quality cases. Because of this, we are increasing the commission rate for
                  successfully closed cases and aligning payment with quality performance.
                </p>

                <p>
                  Please review and click <strong>&ldquo;I Agree&rdquo;</strong> to acknowledge this
                  update.
                </p>
              </div>

              <button
                onClick={acknowledge}
                className="mt-7 w-full bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-bold text-sm py-3 rounded-xl transition-colors"
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
