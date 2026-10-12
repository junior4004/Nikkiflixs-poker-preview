(() => {
  const rowsEl = document.getElementById('leaderboard-rows');
  const stats = new Map();
  const ensure = name => {
    const key = String(name || 'Player').slice(0, 18);
    if (!stats.has(key)) stats.set(key, { name: key, tournamentWins: 0, cashResult: 0 });
    return stats.get(key);
  };
  const formatResult = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString()}`;
  const render = () => {
    if (!rowsEl) return;
    const ordered = [...stats.values()].sort((a, b) => b.tournamentWins - a.tournamentWins || b.cashResult - a.cashResult || a.name.localeCompare(b.name));
    rowsEl.replaceChildren(...ordered.map((entry, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      row.innerHTML = `<span><b>${index + 1}</b><strong></strong></span><span>${entry.tournamentWins.toLocaleString()}</span><span class="${entry.cashResult > 0 ? 'positive' : entry.cashResult < 0 ? 'negative' : ''}">${formatResult(entry.cashResult)}</span>`;
      row.querySelector('strong').textContent = entry.name;
      return row;
    }));
  };

  (window.__game?.players || []).forEach(player => ensure(player.name));

  window.NikkiflixLeaderboard = {
    rename(from, to) {
      const oldName = String(from || 'You');
      const newName = String(to || 'You').slice(0, 18);
      if (oldName === newName) return;
      const previous = stats.get(oldName);
      const next = ensure(newName);
      if (previous && previous !== next) {
        next.tournamentWins += previous.tournamentWins;
        next.cashResult += previous.cashResult;
        stats.delete(oldName);
      }
      render();
    },
    recordCash(players, startingStacks) {
      players.forEach((player, index) => {
        ensure(player.name).cashResult += Math.round(player.stack - (startingStacks[index] || 0));
      });
      render();
    },
    recordTournament(winnerName) {
      ensure(winnerName).tournamentWins += 1;
      render();
    },
    render
  };
  render();
})();
