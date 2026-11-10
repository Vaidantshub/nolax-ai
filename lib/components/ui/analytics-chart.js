/**
 * Analytics Overview Chart — Recreating the Acme Traffic Overview graph (Image 1)
 * Powered by Chart.js with custom tooltips, gradients, and timeframe controls.
 */

window.initAnalyticsChart = function(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Datasets for timeframes
  const dataMap = {
    '7D': {
      label: '7 Days',
      metric: '32,480',
      change: '+14.2%',
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      primary: [26000, 27500, 29000, 28200, 31000, 32100, 32480],
      secondary: [2200, 2100, 2400, 2300, 2500, 2450, 2400],
      max: 40000
    },
    '30D': {
      label: '30 Days',
      metric: '134,100',
      change: '+38.0%',
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      primary: [28000, 31900, 34200, 38600],
      secondary: [2400, 2400, 2500, 2600],
      max: 40000
    },
    '90D': {
      label: '90 Days',
      metric: '412,850',
      change: '+62.4%',
      labels: ['Month 1', 'Month 2', 'Month 3'],
      primary: [110000, 142000, 160850],
      secondary: [9500, 10200, 10800],
      max: 180000
    }
  };

  let currentKey = '30D';
  let chartInstance = null;

  function createGradient(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'rgba(15, 23, 42, 0.12)';
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
    gradient.addColorStop(0.65, 'rgba(15, 23, 42, 0.05)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    return gradient;
  }

  function renderChart(key) {
    const d = dataMap[key];
    if (chartInstance) {
      chartInstance.destroy();
    }

    // Update UI metric counters
    const metricEl = document.getElementById('analyticsMetric');
    const changeEl = document.getElementById('analyticsChange');
    const labelEl = document.getElementById('timeframeLabel');
    if (metricEl) metricEl.textContent = d.metric;
    if (changeEl) changeEl.textContent = '↑ ' + d.change;
    if (labelEl) labelEl.textContent = d.label;

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          {
            label: 'Visitors',
            data: d.primary,
            borderColor: '#111827',
            borderWidth: 2.5,
            fill: true,
            backgroundColor: (context) => createGradient(context.chart),
            tension: 0.35,
            pointBackgroundColor: '#111827',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#111827',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2.5,
            order: 1
          },
          {
            label: 'Signups',
            data: d.secondary,
            borderColor: '#6b7280',
            borderWidth: 1.5,
            borderDash: [3, 3],
            fill: false,
            tension: 0.1,
            pointBackgroundColor: '#6b7280',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#6b7280',
            pointHoverBorderColor: '#ffffff',
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#ffffff',
            titleColor: '#0f172a',
            bodyColor: '#334155',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            cornerRadius: 10,
            titleFont: {
              family: 'Plus Jakarta Sans, Inter, sans-serif',
              size: 12,
              weight: 'bold'
            },
            bodyFont: {
              family: 'Plus Jakarta Sans, Inter, sans-serif',
              size: 12
            },
            shadowOffsetX: 0,
            shadowOffsetY: 8,
            shadowBlur: 16,
            shadowColor: 'rgba(0, 0, 0, 0.1)',
            callbacks: {
              title: function(items) {
                return items[0].label;
              },
              label: function(item) {
                const val = item.raw.toLocaleString();
                return ' ' + item.dataset.label + ':  ' + val;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'Plus Jakarta Sans, Inter, sans-serif',
                size: 11
              },
              padding: 10
            }
          },
          y: {
            beginAtZero: true,
            max: d.max,
            grid: {
              color: '#e2e8f0',
              borderDash: [4, 4],
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'Plus Jakarta Sans, Inter, sans-serif',
                size: 11
              },
              padding: 10,
              callback: function(val) {
                return (val / 1000) + 'k';
              }
            }
          }
        }
      }
    });
  }

  // Initial render
  renderChart(currentKey);

  // Timeframe dropdown switcher
  window.switchAnalyticsTimeframe = function(key) {
    if (dataMap[key]) {
      currentKey = key;
      renderChart(key);
      const menu = document.getElementById('timeframeMenu');
      if (menu) menu.classList.add('hidden');
    }
  };

  const btn = document.getElementById('timeframeBtn');
  const menu = document.getElementById('timeframeMenu');
  if (btn && menu) {
    btn.onclick = function(e) {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    };
    document.addEventListener('click', function() {
      menu.classList.add('hidden');
    });
  }
};

