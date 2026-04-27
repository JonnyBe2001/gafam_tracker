document.addEventListener('DOMContentLoaded', () => {
  // Lade gespeicherte Daten
  browser.storage.local.get(['totalTime', 'gafamTime'], (data) => {
    const totalTime = data.totalTime || 0;
    const gafamTime = data.gafamTime || 0;
    const percentage = totalTime > 0 ? Math.round((gafamTime / totalTime) * 100) : 0;

    // Aktualisiere UI
    document.getElementById('total-time').textContent = Math.round(totalTime);
    document.getElementById('gafam-time').textContent = Math.round(gafamTime);
    document.getElementById('percentage').textContent = percentage;

    // Erstelle Diagramm
    renderChart(totalTime, gafamTime);
  });

  // Export-Funktion
  document.getElementById('export-data').addEventListener('click', () => {
    browser.storage.local.get(['totalTime', 'gafamTime'], (data) => {
      const csvContent = `Gesamtzeit,GAFAM-Zeit,Anteil\n${data.totalTime || 0},${data.gafamTime || 0},${data.totalTime > 0 ? (data.gafamTime / data.totalTime) * 100 : 0}`;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gafam-tracker-daten.csv';
      a.click();
    });
  });

  function renderChart(total, gafam) {
    const ctx = document.getElementById('time-chart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['GAFAM', 'Andere Websites'],
        datasets: [{
          data: [gafam, total - gafam],
          backgroundColor: ['#FF6384', '#36A2EB'],
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${Math.round(context.raw)} Sek.`
            }
          }
        }
      }
    });
  }
});