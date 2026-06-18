const linkTypes = ["email", "whatsapp", "phone"];
const dayMs = 86400000;

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const startOfLocalDay = (timestamp) => {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const percent = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

export function summarizeStatistics(rawUsers, now = Date.now()) {
  const dayStart = startOfLocalDay(now);
  const weekStart = dayStart - (6 * dayMs);
  const monthStart = dayStart - (29 * dayMs);
  const activeNowStart = now - (15 * 60000);
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = weekStart + (index * dayMs);
    return {
      key: start,
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(start),
      sessions: 0,
      clicks: 0
    };
  });
  const users = Object.entries(rawUsers || {}).map(([uid, user = {}]) => {
    const visits = user.visits || {};
    const clicks = linkTypes.reduce((result, type) => {
      result[type] = number(user.linkClicks?.[type]?.count);
      return result;
    }, {});
    const sessions = Object.values(user.sessionHistory || {})
      .map((entry) => number(entry?.startedAt))
      .filter(Boolean);
    const clickEvents = Object.values(user.clickHistory || {})
      .map((entry) => ({ type: entry?.type, at: number(entry?.at) }))
      .filter((entry) => linkTypes.includes(entry.type) && entry.at);

    return {
      uid,
      createdAt: number(user.profile?.createdAt),
      lastAt: number(user.activity?.lastSeenAt || visits.lastAt),
      visitCount: number(visits.count),
      clicks,
      clickCount: linkTypes.reduce((sum, type) => sum + clicks[type], 0),
      sessions,
      clickEvents
    };
  });

  const totals = linkTypes.reduce((result, type) => {
    result[type] = users.reduce((sum, user) => sum + user.clicks[type], 0);
    return result;
  }, {});
  const clickTotal = linkTypes.reduce((sum, type) => sum + totals[type], 0);
  const totalUsers = users.length;
  const sessionTotal = users.reduce((sum, user) => sum + user.visitCount, 0);
  const newToday = users.filter((user) => user.createdAt >= dayStart).length;
  const activeNow = users.filter((user) => user.lastAt >= activeNowStart).length;
  const active7d = users.filter((user) => user.lastAt >= weekStart).length;
  const active30d = users.filter((user) => user.lastAt >= monthStart).length;
  const returningUsers = users.filter((user) => user.visitCount > 1).length;
  const engagedUsers = users.filter((user) => user.clickCount > 0).length;
  let todaySessions = 0;
  let todayClicks = 0;

  users.forEach((user) => {
    user.sessions.forEach((timestamp) => {
      if (timestamp >= dayStart) todaySessions += 1;
      if (timestamp < weekStart || timestamp >= weekStart + (7 * dayMs)) return;
      const day = days.find((entry) => entry.key === startOfLocalDay(timestamp));
      if (day) day.sessions += 1;
    });
    user.clickEvents.forEach((event) => {
      if (event.at >= dayStart) todayClicks += 1;
      if (event.at < weekStart || event.at >= weekStart + (7 * dayMs)) return;
      const day = days.find((entry) => entry.key === startOfLocalDay(event.at));
      if (day) day.clicks += 1;
    });
  });

  const links = linkTypes.map((type) => {
    const uniqueUsers = users.filter((user) => user.clicks[type] > 0).length;
    return {
      type,
      total: totals[type],
      uniqueUsers,
      userRate: percent(uniqueUsers, totalUsers),
      share: percent(totals[type], clickTotal)
    };
  });
  const recentUsers = [...users]
    .filter((user) => user.lastAt)
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 8);

  return {
    totalUsers,
    newToday,
    activeNow,
    active7d,
    active30d,
    sessionTotal,
    todaySessions,
    clickTotal,
    todayClicks,
    returningUsers,
    returningRate: percent(returningUsers, totalUsers),
    engagedUsers,
    engagedRate: percent(engagedUsers, totalUsers),
    sessionsPerUser: totalUsers ? sessionTotal / totalUsers : 0,
    clicksPerSession: sessionTotal ? clickTotal / sessionTotal : 0,
    links,
    days,
    recentUsers
  };
}
