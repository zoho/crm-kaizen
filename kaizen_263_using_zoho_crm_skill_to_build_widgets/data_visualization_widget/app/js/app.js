(function () {
  'use strict';

  var state = {
    layouts: [],          // [{id, name, stageOrder: [{actual_value, display_value, sequence_number}]}]
    globalStageOrder: [], // fallback single list when layouts call fails
    deals: []
  };

  var fetchCalled = false;

  function setStatus(msg, isError) {
    var el = document.getElementById('statusMsg');
    el.textContent = msg || '';
    el.style.color = isError ? '#a33' : '#666';
  }

  function describeError(err) {
    if (err && err.name === 'ApiError' && err.details) {
      return 'API error: ' + (err.details.message || JSON.stringify(err.details));
    }
    return 'Error: ' + (err && err.message ? err.message : String(err));
  }

  // ---------- Stage / pipeline metadata ----------

  function findFieldInLayout(layout, apiName) {
    var sections = layout.sections || [];
    for (var i = 0; i < sections.length; i++) {
      var fields = sections[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].api_name === apiName) return fields[j];
      }
    }
    return null;
  }

  async function loadStageMetadata() {
    try {
      var res = await zrc.get('/crm/v8/settings/layouts', { params: { module: 'Deals' } });
      var layouts = (res.data && res.data.layouts) || [];
      state.layouts = layouts.map(function (layout) {
        var stageField = findFieldInLayout(layout, 'Stage');
        var order = (stageField && stageField.pick_list_values) || [];
        order = order.slice().sort(function (a, b) { return a.sequence_number - b.sequence_number; });
        return { id: layout.id, name: layout.name, stageOrder: order };
      });
    } catch (err) {
      console.error('layouts fetch failed, will fall back to global Stage field order', err);
      state.layouts = [];
    }

    if (!state.layouts.length) {
      try {
        var fres = await zrc.get('/crm/v8/settings/fields', { params: { module: 'Deals' } });
        var fields = (fres.data && fres.data.fields) || [];
        var stageField = fields.filter(function (f) { return f.api_name === 'Stage'; })[0];
        var order = (stageField && stageField.pick_list_values) || [];
        state.globalStageOrder = order.slice().sort(function (a, b) { return a.sequence_number - b.sequence_number; });
      } catch (err2) {
        console.error('global Stage field fetch failed', err2);
        state.globalStageOrder = [];
      }
    }
  }

  function populatePipelineDropdown() {
    var select = document.getElementById('pipelineFilter');
    state.layouts.forEach(function (layout) {
      var opt = document.createElement('option');
      opt.value = layout.id;
      opt.textContent = layout.name;
      select.appendChild(opt);
    });
  }

  function getStageOrderForPipeline(layoutId) {
    if (layoutId) {
      var match = state.layouts.filter(function (l) { return l.id === layoutId; })[0];
      if (match && match.stageOrder.length) return match.stageOrder;
    }
    if (state.layouts.length) {
      var merged = [];
      var seen = {};
      state.layouts.forEach(function (l) {
        l.stageOrder.forEach(function (s) {
          if (!seen[s.actual_value]) { seen[s.actual_value] = true; merged.push(s); }
        });
      });
      if (merged.length) return merged;
    }
    return state.globalStageOrder;
  }

  // ---------- Deals data (COQL) ----------

  function buildDealsQuery(dateFrom, dateTo) {
    // COQL requires a non-empty WHERE clause; use a no-op filter when no date range is set.
    var whereClause = 'Closing_Date is not null';
    if (dateFrom && dateTo) {
      whereClause = "Closing_Date between '" + dateFrom + "' and '" + dateTo + "'";
    } else if (dateFrom) {
      whereClause = "Closing_Date >= '" + dateFrom + "'";
    } else if (dateTo) {
      whereClause = "Closing_Date <= '" + dateTo + "'";
    }
    return 'select id, Deal_Name, Stage, Amount, Closing_Date, Account_Name, Contact_Name, Layout ' +
      'from Deals where (' + whereClause + ') limit 0, 200';
  }

  async function loadDeals(dateFrom, dateTo) {
    var query = buildDealsQuery(dateFrom, dateTo);
    var res = await zrc.post('/crm/v8/coql', { select_query: query });
    return (res.data && res.data.data) || [];
  }

  // ---------- Orchestration ----------

  async function refresh() {
    setStatus('Loading...', false);
    try {
      var dateFrom = document.getElementById('dateFrom').value;
      var dateTo = document.getElementById('dateTo').value;
      var pipelineId = document.getElementById('pipelineFilter').value;

      var deals = await loadDeals(dateFrom, dateTo);
      if (pipelineId) {
        // Layout lookup equality in COQL WHERE is unverified; filter client-side instead.
        deals = deals.filter(function (d) { return d.Layout && d.Layout.id === pipelineId; });
      }
      state.deals = deals;

      renderFunnel(deals, getStageOrderForPipeline(pipelineId));
      renderGraph(deals);
      setStatus(deals.length ? '' : 'No deals matched the selected filters.', !deals.length);
    } catch (err) {
      console.error(err);
      setStatus(describeError(err), true);
    }
  }

  // ---------- Funnel chart (hand-rolled SVG) ----------

  function widthForCount(count, maxCount, funnelWidth) {
    var minWidth = funnelWidth * 0.12;
    if (maxCount <= 0) return minWidth;
    return minWidth + (funnelWidth - minWidth) * (count / maxCount);
  }

  function renderFunnel(deals, stageOrder) {
    var container = document.getElementById('funnelChart');
    container.innerHTML = '';

    var counts = {};
    deals.forEach(function (d) {
      var stage = d.Stage || 'Unspecified';
      counts[stage] = (counts[stage] || 0) + 1;
    });

    var orderedNames = stageOrder.length
      ? stageOrder.map(function (s) { return s.actual_value || s.display_value; })
      : Object.keys(counts);

    Object.keys(counts).forEach(function (name) {
      if (orderedNames.indexOf(name) === -1) orderedNames.push(name);
    });

    var rows = orderedNames
      .map(function (name) { return { name: name, count: counts[name] || 0 }; })
      .filter(function (row) { return row.count > 0; });

    if (!rows.length) {
      container.innerHTML = '<p style="color:#888;font-size:12px;">No stage data to display.</p>';
      return;
    }

    var width = container.clientWidth || 420;
    var funnelWidth = Math.max(180, width * 0.55);
    var rowHeight = 46;
    var height = rows.length * rowHeight + 20;
    var maxCount = Math.max.apply(null, rows.map(function (r) { return r.count; }));

    var svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height);

    rows.forEach(function (row, i) {
      var curWidth = widthForCount(row.count, maxCount, funnelWidth);
      var nextWidth = rows[i + 1] ? widthForCount(rows[i + 1].count, maxCount, funnelWidth) : curWidth;
      var yTop = 10 + i * rowHeight;
      var yBottom = yTop + rowHeight - 4;
      var cx = funnelWidth / 2 + 10;

      var topLeft = cx - curWidth / 2;
      var topRight = cx + curWidth / 2;
      var botLeft = cx - nextWidth / 2;
      var botRight = cx + nextWidth / 2;

      var points = [[topLeft, yTop], [topRight, yTop], [botRight, yBottom], [botLeft, yBottom]]
        .map(function (p) { return p.join(','); })
        .join(' ');

      svg.append('polygon')
        .attr('points', points)
        .attr('fill', d3.interpolateBlues(0.3 + (0.6 * i / Math.max(1, rows.length - 1))))
        .attr('stroke', '#fff');

      var labelY = (yTop + yBottom) / 2;
      svg.append('line')
        .attr('class', 'funnel-leader')
        .attr('x1', funnelWidth + 14)
        .attr('y1', labelY)
        .attr('x2', funnelWidth + 24)
        .attr('y2', labelY);

      svg.append('text')
        .attr('class', 'funnel-stage-label')
        .attr('x', funnelWidth + 28)
        .attr('y', labelY + 4)
        .text(row.name + ' (' + row.count + ')');
    });
  }

  // ---------- Relationship graph (D3 force layout) ----------

  function describeNode(node) {
    if (node.type === 'deal') {
      var d = node.data || {};
      return [
        'Deal: ' + (d.Deal_Name || d.id),
        'Stage: ' + (d.Stage || 'n/a'),
        'Amount: ' + (d.Amount != null ? d.Amount : 'n/a'),
        'Closing Date: ' + (d.Closing_Date || 'n/a')
      ].join('\n');
    }
    if (node.type === 'account') return 'Account: ' + node.label;
    if (node.type === 'contact') return 'Contact: ' + node.label;
    return node.label;
  }

  function openRecord(module, recordId) {
    if (!recordId) return;
    try {
      ZOHO.CRM.UI.Record.open({ Entity: module, RecordID: recordId });
    } catch (err) {
      console.error('Failed to open record', err);
    }
  }

  function renderGraph(deals) {
    var container = document.getElementById('graphChart');
    var panel = container.closest('.panel');
    container.innerHTML = '';

    var nodesById = {};
    var links = [];

    deals.forEach(function (deal) {
      var dealNodeId = 'deal:' + deal.id;
      nodesById[dealNodeId] = {
        id: dealNodeId,
        recordId: deal.id,
        module: 'Deals',
        label: deal.Deal_Name || deal.id,
        type: 'deal',
        data: deal
      };

      if (deal.Account_Name && deal.Account_Name.id) {
        var acctNodeId = 'account:' + deal.Account_Name.id;
        if (!nodesById[acctNodeId]) {
          nodesById[acctNodeId] = {
            id: acctNodeId,
            recordId: deal.Account_Name.id,
            module: 'Accounts',
            label: deal.Account_Name.name,
            type: 'account'
          };
        }
        links.push({ source: dealNodeId, target: acctNodeId });
      }

      if (deal.Contact_Name && deal.Contact_Name.id) {
        var contactNodeId = 'contact:' + deal.Contact_Name.id;
        if (!nodesById[contactNodeId]) {
          nodesById[contactNodeId] = {
            id: contactNodeId,
            recordId: deal.Contact_Name.id,
            module: 'Contacts',
            label: deal.Contact_Name.name,
            type: 'contact'
          };
        }
        links.push({ source: dealNodeId, target: contactNodeId });
      }
    });

    var nodes = Object.keys(nodesById).map(function (k) { return nodesById[k]; });

    if (!nodes.length) {
      container.innerHTML = '<p style="color:#888;font-size:12px;">No relationship data to display.</p>';
      return;
    }

    var width = container.clientWidth || 420;
    var height = 420;
    var colorByType = { deal: '#e06b3a', account: '#3a7ae0', contact: '#3aa85a' };
    var radiusByType = { deal: 8, account: 6, contact: 6 };

    var svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height);

    var zoomLayer = svg.append('g').attr('class', 'zoom-layer');

    var zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', function (event) {
        zoomLayer.attr('transform', event.transform);
      });

    svg.call(zoomBehavior).on('dblclick.zoom', null);

    var linkSelection = zoomLayer.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link');

    var nodeGroup = zoomLayer.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

    nodeGroup.append('circle')
      .attr('r', function (d) { return radiusByType[d.type] || 6; })
      .attr('fill', function (d) { return colorByType[d.type] || '#999'; });

    nodeGroup.append('text')
      .attr('dx', 10)
      .attr('dy', 4)
      .text(function (d) { return d.label; });

    var tooltip = d3.select('#tooltip');

    nodeGroup
      .on('mouseenter', function (event, d) {
        var pos = d3.pointer(event, panel);
        tooltip.classed('hidden', false)
          .style('left', (pos[0] + 14) + 'px')
          .style('top', (pos[1] + 14) + 'px')
          .text(describeNode(d));
      })
      .on('mousemove', function (event) {
        var pos = d3.pointer(event, panel);
        tooltip
          .style('left', (pos[0] + 14) + 'px')
          .style('top', (pos[1] + 14) + 'px');
      })
      .on('mouseleave', function () {
        tooltip.classed('hidden', true);
      })
      .on('click', function (event, d) {
        openRecord(d.module, d.recordId);
      });

    var simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(70))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(26))
      .on('tick', ticked);

    function ticked() {
      linkSelection
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });

      nodeGroup.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    }

    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  // ---------- Bootstrap ----------

  async function initialLoad() {
    if (fetchCalled) return;
    fetchCalled = true;
    await loadStageMetadata();
    populatePipelineDropdown();
    await refresh();
  }

  ZOHO.embeddedApp.on('PageLoad', function () {
    initialLoad();
  });

  ZOHO.embeddedApp.init();

  // Web Tab placement may not fire PageLoad reliably — fall back after a short delay.
  setTimeout(function () {
    if (!fetchCalled) initialLoad();
  }, 1500);

  document.getElementById('applyFilters').addEventListener('click', refresh);
})();
