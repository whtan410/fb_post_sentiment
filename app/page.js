'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sortColumn, setSortColumn] = useState('created_time')
  const [sortDirection, setSortDirection] = useState('desc')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [notificationPermission, setNotificationPermission] = useState('default')
  const [unreadCount, setUnreadCount] = useState(0)
  const [audioEnabled, setAudioEnabled] = useState(true)

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission)
        })
      }
    }
  }, [])

  // Update favicon with notification badge
  useEffect(() => {
    if (unreadCount > 0) {
      // Update document title with count
      document.title = `(${unreadCount}) Facebook Notifications`

      // Create a canvas to draw badge on favicon
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')

      // Draw red circle
      ctx.fillStyle = '#ff0000'
      ctx.beginPath()
      ctx.arc(24, 8, 8, 0, 2 * Math.PI)
      ctx.fill()

      // Draw white text
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(unreadCount > 9 ? '9+' : unreadCount.toString(), 24, 8)

      // Update favicon
      const link = document.querySelector("link[rel*='icon']") || document.createElement('link')
      link.type = 'image/x-icon'
      link.rel = 'shortcut icon'
      link.href = canvas.toDataURL()
      document.getElementsByTagName('head')[0].appendChild(link)
    } else {
      document.title = 'Facebook Notifications'
      // Reset to default favicon if exists
      const link = document.querySelector("link[rel*='icon']")
      if (link) {
        link.href = '/favicon.ico'
      }
    }
  }, [unreadCount])

  // Notification function with sound
  function showNotification(title, body) {
    // Play notification sound
    if (audioEnabled) {
      const audio = new Audio('/notification.mp3')
      audio.volume = 0.5
      audio.play().catch(err => console.log('Audio play failed:', err))
    }

    // Show browser notification
    if (notificationPermission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'facebook-notification',
        requireInteraction: false
      })
    }

    // Increment unread count
    setUnreadCount(prev => prev + 1)
  }

  useEffect(() => {
    fetchNotifications()

    // Set up notification interval every 20 minutes (1200000ms)
    const notificationInterval = setInterval(() => {
      showNotification(
        'Facebook Notification',
        'New activity on your posts! Check your dashboard.'
      )
    }, 1200000) // 1200000ms = 20 minutes

    // Set up automatic polling every 5 minutes (300000ms)
    const pollInterval = setInterval(() => {
      fetchNotifications(true) // true = silent refresh
    }, 300000)

    // Set up Supabase real-time subscription
    const channel = supabase
      .channel('facebook_notifications_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'facebook_notifications'
        },
        (payload) => {
          console.log('Real-time change detected:', payload)
          fetchNotifications(true) // Fetch new data when changes occur
          showNotification(
            'New Facebook Activity',
            'Real-time update detected on your posts!'
          )
        }
      )
      .subscribe()

    // Cleanup on unmount
    return () => {
      clearInterval(notificationInterval)
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [notificationPermission, audioEnabled])

  async function fetchNotifications(silent = false) {
    try {
      if (!silent) {
        setLoading(true)
      } else {
        setIsRefreshing(true)
      }

      const { data, error } = await supabase
        .from('facebook_notifications')
        .select('*')
        .order('created_time', { ascending: false })

      if (error) throw error

      setNotifications(data || [])
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching notifications:', err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  function handleManualRefresh() {
    fetchNotifications(true)
  }

  function clearFilters() {
    setPlatformFilter('all')
    setDateFrom('')
    setDateTo('')
    setCurrentPage(1)
  }

  function clearUnreadCount() {
    setUnreadCount(0)
  }

  function toggleAudio() {
    setAudioEnabled(prev => !prev)
  }

  function handleSort(column) {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Get unique platforms for filter
  const platforms = useMemo(() => {
    const uniquePlatforms = [...new Set(notifications.map(n => n.platform).filter(Boolean))]
    return uniquePlatforms.sort()
  }, [notifications])

  // Filter and sort notifications
  const filteredAndSortedNotifications = useMemo(() => {
    let filtered = [...notifications]

    // Apply platform filter
    if (platformFilter !== 'all') {
      filtered = filtered.filter(n => n.platform === platformFilter)
    }

    // Apply date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      fromDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(n => {
        if (!n.created_time) return false
        const createdDate = new Date(n.created_time)
        return createdDate >= fromDate
      })
    }

    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(n => {
        if (!n.created_time) return false
        const createdDate = new Date(n.created_time)
        return createdDate <= toDate
      })
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue = a[sortColumn]
      let bValue = b[sortColumn]

      // Handle null/undefined values
      if (aValue == null) aValue = ''
      if (bValue == null) bValue = ''

      // Handle different data types
      if (sortColumn === 'created_time') {
        aValue = new Date(aValue).getTime() || 0
        bValue = new Date(bValue).getTime() || 0
      } else if (sortColumn === 'id' || sortColumn === 'reactions_count' || sortColumn === 'comments_count') {
        aValue = Number(aValue) || 0
        bValue = Number(bValue) || 0
      } else {
        aValue = String(aValue).toLowerCase()
        bValue = String(bValue).toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [notifications, platformFilter, dateFrom, dateTo, sortColumn, sortDirection])

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredAndSortedNotifications.length
    const totalReactions = filteredAndSortedNotifications.reduce((sum, n) => sum + (n.reactions_count || 0), 0)
    const totalComments = filteredAndSortedNotifications.reduce((sum, n) => sum + (n.comments_count || 0), 0)
    return {
      total,
      totalReactions,
      totalComments,
      avgReactions: total > 0 ? Math.round(totalReactions / total) : 0
    }
  }, [filteredAndSortedNotifications])

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedNotifications.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedNotifications = filteredAndSortedNotifications.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [platformFilter, dateFrom, dateTo, itemsPerPage])

  function goToPage(page) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  function changeItemsPerPage(newItemsPerPage) {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-lg text-gray-700">Loading notifications...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
          <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
          <div className="text-gray-700">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                Facebook Notifications
              </h1>
              <p className="text-gray-600">Monitor and track your social media engagement</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Notification Badge */}
              {unreadCount > 0 && (
                <button
                  onClick={clearUnreadCount}
                  className="relative px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2 font-medium shadow-sm"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                  </svg>
                  <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                    {unreadCount}
                  </span>
                  Clear
                </button>
              )}

              {/* Audio Toggle */}
              <button
                onClick={toggleAudio}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium shadow-sm ${
                  audioEnabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {audioEnabled ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                )}
                {audioEnabled ? 'Sound On' : 'Sound Off'}
              </button>

              {/* Notification Permission Status */}
              {notificationPermission !== 'granted' && (
                <div className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-200">
                  Enable notifications in browser settings
                </div>
              )}

              {lastUpdated && (
                <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-lg shadow-sm">
                  <span className="font-medium">Last updated:</span> {lastUpdated.toLocaleTimeString()}
                </div>
              )}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className={`px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium ${
                  isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Notification Info Banner */}
          <div className="mb-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">
                Browser notifications enabled! You'll receive alerts every minute with sound and visual badges.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Notifications will appear even when this tab is in the background.
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Posts</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Reactions</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalReactions.toLocaleString()}</p>
                </div>
                <div className="bg-pink-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Comments</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalComments.toLocaleString()}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Avg Reactions</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.avgReactions}</p>
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Filters Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label htmlFor="platform-filter" className="text-sm text-gray-700 font-medium">
                  Platform:
                </label>
                <select
                  id="platform-filter"
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-colors"
                >
                  <option value="all">All Platforms</option>
                  {platforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="date-from" className="text-sm text-gray-700 font-medium">
                  From:
                </label>
                <input
                  type="date"
                  id="date-from"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="date-to" className="text-sm text-gray-700 font-medium">
                  To:
                </label>
                <input
                  type="date"
                  id="date-to"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-colors"
                />
              </div>

              {(platformFilter !== 'all' || dateFrom || dateTo) && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('id')}
                  >
                    <div className="flex items-center gap-2">
                      ID
                      {sortColumn === 'id' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('message')}
                  >
                    <div className="flex items-center gap-2">
                      Message
                      {sortColumn === 'message' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('created_time')}
                  >
                    <div className="flex items-center gap-2">
                      Created Time
                      {sortColumn === 'created_time' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('reactions_count')}
                  >
                    <div className="flex items-center gap-2">
                      Reactions
                      {sortColumn === 'reactions_count' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('comments_count')}
                  >
                    <div className="flex items-center gap-2">
                      Comments
                      {sortColumn === 'comments_count' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('platform')}
                  >
                    <div className="flex items-center gap-2">
                      Platform
                      {sortColumn === 'platform' && (
                        <span className="text-gray-700">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedNotifications.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-gray-500 font-medium mb-1">No notifications found</p>
                        <p className="text-sm text-gray-400">Try adjusting your filters or check back later</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedNotifications.map((notification, index) => (
                    <tr
                      key={notification.id}
                      className={`hover:bg-blue-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                          #{notification.id}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {notification.permalink_url ? (
                          <a
                            href={notification.permalink_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2 group line-clamp-3"
                          >
                            <span className="line-clamp-3">{notification.message || 'View Post'}</span>
                            <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="line-clamp-3 text-gray-700">{notification.message || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {notification.created_time ? (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(notification.created_time).toLocaleString()}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          <span className="font-semibold text-gray-900">{(notification.reactions_count || 0).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span className="font-semibold text-gray-900">{(notification.comments_count || 0).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-medium text-xs uppercase">
                          {notification.platform || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {filteredAndSortedNotifications.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* Items per page selector */}
              <div className="flex items-center gap-3">
                <label htmlFor="items-per-page" className="text-sm text-gray-700 font-medium">
                  Show:
                </label>
                <select
                  id="items-per-page"
                  value={itemsPerPage}
                  onChange={(e) => changeItemsPerPage(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-white transition-colors"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span className="text-sm text-gray-600">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredAndSortedNotifications.length)} of {filteredAndSortedNotifications.length}
                </span>
              </div>

              {/* Page navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-1 ${
                    currentPage === 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      )
                    })
                    .map((page, index, array) => (
                      <div key={page} className="flex items-center">
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 text-gray-400">...</span>
                        )}
                        <button
                          onClick={() => goToPage(page)}
                          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                            currentPage === page
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {page}
                        </button>
                      </div>
                    ))}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-1 ${
                    currentPage === totalPages
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 bg-white rounded-xl shadow-md p-4 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {platformFilter !== 'all' || dateFrom || dateTo ? (
                <span className="font-medium">
                  Showing <span className="text-blue-600 font-bold">{filteredAndSortedNotifications.length}</span> of <span className="font-bold">{notifications.length}</span> notifications
                </span>
              ) : (
                <span className="font-medium">
                  Total notifications: <span className="text-blue-600 font-bold">{notifications.length}</span>
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              Auto-refreshes every 5 minutes
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
