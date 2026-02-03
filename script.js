// Lucide icon replacement after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Help modal open/close
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpModalBtn = document.getElementById('close-help-modal');

    if (helpBtn && helpModal && closeHelpModalBtn) {
        helpBtn.addEventListener('click', (e) => {
            helpModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        });
        closeHelpModalBtn.addEventListener('click', (e) => {
            helpModal.classList.add('hidden');
            document.body.style.overflow = '';
        });
        // Close modal when clicking outside the content
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    }
});

// Graph data structure
class Graph {
    constructor(vertices) {
        this.V = vertices;
        this.adj = Array(vertices).fill().map(() => []);
        this.nodes = Array(vertices).fill().map((_, i) => ({
            id: i, x: 0, y: 0, label: `Node ${i}`,
            type: 'intersection',
            capacity: { icu: 0, er: 0 }
        }));
    }
    addEdge(src, dest, weight, road_type) {
        this.adj[src].push({ dest, weight, baseWeight: weight, road_type });
        this.adj[dest].push({ dest: src, weight, baseWeight: weight, road_type });
    }
    setNodeCoordinates(id, x, y, label) {
        // Simple heuristic: if label contains "Hospital" or "Emergency", set type and random capacity
        const isHospital = label.toLowerCase().includes('hospital') || label.toLowerCase().includes('emergency');
        const type = isHospital ? 'hospital' : 'intersection';
        const icu = isHospital ? Math.floor(Math.random() * 5) : 0; // 0-4 beds
        const er = isHospital ? Math.floor(Math.random() * 10) : 0;

        this.nodes[id] = { id, x, y, label, type, capacity: { icu, er } };
    }
}

let graph = null, path = [], dist = [], ambulancePos = 0, animationRunning = false, isDarkMode = false;
let mapBg = null;
let mapLoaded = false;
let defaultMapUrl = 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Map_of_New_York_City_location_map.png';
// Using a generic city map placeholder from placeholder.com or similar is risky if it breaks. 
// Let's use a Data URI or a reliable static pattern.
// Function to generate a simple grid map if image fails?


// Priority Queue
class PriorityQueue {
    constructor() { this.values = []; }
    enqueue(val) { this.values.push(val); this.values.sort((a, b) => a[0] - b[0]); }
    dequeue() { return this.values.shift(); }
    isEmpty() { return this.values.length === 0; }
}

// Dijkstra's algorithm
function dijkstra(g, src, dest, severity = 'critical') {
    try {
        dist = Array(g.V).fill(Infinity);
        let parent = Array(g.V).fill(-1);
        let pq = new PriorityQueue();
        dist[src] = 0;
        pq.enqueue([0, src]);

        const trafficFactor = parseFloat(document.getElementById('traffic-slider').value);

        while (!pq.isEmpty()) {
            let [d, u] = pq.dequeue();
            if (u === dest) break;
            if (d > dist[u]) continue;

            for (let e of g.adj[u]) {
                let v = e.dest;
                // Calculate effective weight
                let effectiveWeight = e.weight;

                // If weight is Infinity (road closed), it remains Infinity regardless of severity
                if (effectiveWeight !== Infinity) {
                    if (severity === 'non-critical') {
                        effectiveWeight *= trafficFactor;
                    }
                    // If critical, we ignore traffic (use base weight), so we don't multiply.
                }

                if (dist[u] + effectiveWeight < dist[v]) {
                    dist[v] = dist[u] + effectiveWeight;
                    parent[v] = u;
                    pq.enqueue([dist[v], v]);
                }
            }
        }

        path = [];
        if (dist[dest] === Infinity) {
            showToast('No path exists!', 'bg-red-600');
            document.getElementById('output').innerText = 'No path exists';
            return;
        }

        for (let v = dest; v !== -1; v = parent[v]) path.push(v);
        path.reverse();

        let output = `Fastest Route: ${path.map(id => graph.nodes[id].label).join(' → ')}\n`;
        output += `Distance: ${dist[dest].toFixed(2)} km\n`;
        output += `Estimated Time: ${dist[dest].toFixed(2)} min`;
        document.getElementById('output').innerText = output;
        logEvent(`Route Calculated: ${path.length} nodes`);
        ambulancePos = 0;
        animationRunning = true;
        showToast('Route found!');
        document.getElementById('loading').style.display = 'none';
    } catch (e) {
        showToast('Error: ' + e.message, 'bg-red-600');
    }
}

// Load graph
function loadGraph() {
    try {
        const input = document.getElementById('graph-input').value.trim().split('\n');
        // Filter out empty lines/comments
        const validLines = input.filter(l => l.trim().length > 0 && !l.startsWith('#'));

        if (validLines.length === 0) throw new Error("Graph input is empty");

        const [V, E] = validLines[0].split(/\s+/).map(Number);

        if (isNaN(V) || isNaN(E)) throw new Error("Invalid Header format. Expected 'V E'");

        graph = new Graph(V);

        for (let i = 1; i <= E; i++) {
            if (!validLines[i]) continue;
            const parts = validLines[i].trim().split(/\s+/);
            if (parts.length < 3) continue; // Skip invalid edge lines

            const src = parseInt(parts[0]);
            const dest = parseInt(parts[1]);
            const weight = parseFloat(parts[2]);
            const road_type = parts[3] || 'arterial';

            if (isNaN(src) || isNaN(dest) || src >= V || dest >= V) {
                console.warn(`Skipping invalid edge at line ${i + 1}: ${validLines[i]}`);
                continue;
            }

            graph.addEdge(src, dest, weight, road_type);
        }

        const labels = ['Central Hospital', 'North Gate', 'East Junction', 'South Hub', 'West Side', 'Uptown', 'Industrial Pk', 'Downtown', 'River Rd', 'Emergency N', 'Clinic S', 'Factory W'];
        // Parse node coords (starts after E lines)
        let nodeIndex = 0;
        for (let i = E + 1; i < validLines.length && nodeIndex < V; i++) {
            const parts = validLines[i].trim().split(/\s+/);
            if (parts.length < 2) continue;

            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);

            if (!isNaN(x) && !isNaN(y)) {
                graph.setNodeCoordinates(nodeIndex, x, y, labels[nodeIndex] || `Node ${nodeIndex}`);
                nodeIndex++;
            }
        }



        updateNodeDropdowns();
        path = [];
        animationRunning = false;
        logEvent('Graph Loaded');
        showToast('Graph loaded successfully!');
    } catch (e) {
        showToast('Error loading graph: ' + e.message, 'bg-red-600');
    }
}

// Update node dropdowns
function updateNodeDropdowns() {
    const sourceSelect = document.getElementById('source-node');
    const destSelect = document.getElementById('dest-node');
    sourceSelect.innerHTML = destSelect.innerHTML = '';
    if (graph) {
        graph.nodes.forEach(node => {
            const option1 = new Option(node.label, node.id);
            const option2 = new Option(node.label, node.id);
            sourceSelect.add(option1);
            destSelect.add(option2);
        });
    }
    sourceSelect.value = '0';
    destSelect.value = graph ? (graph.V - 1).toString() : '3';
}

// Save graph
function saveGraph() {
    if (!graph) return showToast('No graph to save!', 'bg-red-600');
    localStorage.setItem('savedGraph', document.getElementById('graph-input').value);
    logEvent('Graph Saved');
    showToast('Graph saved successfully!');
}

// Simulate rush hour (Non-destructive)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rush-hour').addEventListener('click', () => {
        if (!graph) return showToast('Load a graph first!', 'bg-red-600');
        // Just set the slider to max and trigger input event to update UI text
        const slider = document.getElementById('traffic-slider');
        slider.value = 2.0;
        slider.dispatchEvent(new Event('input'));

        path = [];
        animationRunning = false;
        logEvent('Rush Hour Simulated (Traffic 2.0x)');
        showToast('Rush hour mode activated via Traffic Slider!');
        // Re-calculate if needed
        // findRoute(); // Optional: auto-recalculate
    });

    // Simulate road closure
    document.getElementById('road-closure').addEventListener('click', () => {
        if (!graph) return showToast('Load a graph first!', 'bg-red-600');
        const u = Math.floor(Math.random() * graph.V);
        const edge = graph.adj[u][Math.floor(Math.random() * graph.adj[u].length)];
        if (edge) {
            edge.weight = Infinity;
            graph.adj[edge.dest].find(e => e.dest === u).weight = Infinity;
            path = [];
            animationRunning = false;
            logEvent(`Road Closed: ${graph.nodes[u].label} → ${graph.nodes[edge.dest].label}`);
            showToast('Road closed!');
        }
    });

    // Update traffic slider
    document.getElementById('traffic-slider').addEventListener('input', (e) => {
        document.getElementById('traffic-value').textContent = `${e.target.value}x`;
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.body.classList.toggle('dark', isDarkMode);
        const icon = document.querySelector('#theme-toggle .lucide');
        icon.setAttribute('data-lucide', isDarkMode ? 'sun' : 'moon');
        lucide.createIcons();
        showToast(`Switched to ${isDarkMode ? 'Dark' : 'Light'} Mode!`);
    });

    // Map Upload Handler
    document.getElementById('map-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            mapLoaded = false;
            mapBg = loadImage(url, () => {
                mapLoaded = true;
                showToast("Custom Map Loaded!");
            }, () => {
                mapLoaded = false;
                mapBg = null;
                showToast("Error loading map image.", "bg-red-600");
            });
        }
    });

    // Map Toggle Listener
    document.getElementById('show-map').addEventListener('change', () => {
        redraw();
    });
});

// Reset graph
function resetGraph() {
    document.getElementById('graph-input').value = defaultGraph;
    loadGraph();
    document.getElementById('traffic-slider').value = '1';
    document.getElementById('traffic-value').innerText = '1.0x';
    logEvent('Graph Reset');
    showToast('Graph reset!');
}

// Find route
function findRoute() {
    if (!graph) return showToast('Load a graph first!', 'bg-red-600');
    const src = parseInt(document.getElementById('source-node').value);
    const dest = parseInt(document.getElementById('dest-node').value);
    const severity = document.querySelector('input[name="severity"]:checked').value;

    if (isNaN(src) || isNaN(dest) || src < 0 || src >= graph.V || dest < 0 || dest >= graph.V) {
        showToast('Invalid nodes!', 'bg-red-600');
        return;
    }

    // Check destination capacity if it is a hospital
    const destNode = graph.nodes[dest];
    if (destNode.type === 'hospital') {
        if (destNode.capacity.icu <= 0 && destNode.capacity.er <= 0) {
            showToast(`Warning: ${destNode.label} is at Full Capacity!`, 'bg-yellow-600');
            // We still route, but warn. Or we could block.
        }
    }

    document.getElementById('loading').style.display = 'flex';
    setTimeout(() => dijkstra(graph, src, dest, severity), 300);
}

// Find Nearest Available Hospital
function findNearestHospital() {
    if (!graph) return showToast('Load a graph first!', 'bg-red-600');
    const src = parseInt(document.getElementById('source-node').value);
    const severity = document.querySelector('input[name="severity"]:checked').value;

    // Get all hospitals with capacity
    const hospitals = graph.nodes.filter(n => n.type === 'hospital' && (n.capacity.icu > 0 || n.capacity.er > 0));

    if (hospitals.length === 0) {
        return showToast('No hospitals with capacity available!', 'bg-red-600');
    }

    // Run Dijkstra to find distances to all nodes
    // Using existing dijkstra function is tricky because it stops at dest. 
    // Let's modify dijkstra to run full if dest is -1 or handle basic BFS/Dijkstra here.
    // Actually, we can just run a one-to-all Dijkstra.

    // Simplified One-to-All Dijkstra locally
    let dists = Array(graph.V).fill(Infinity);
    let trafficFactor = parseFloat(document.getElementById('traffic-slider').value);
    dists[src] = 0;
    let pq = new PriorityQueue();
    pq.enqueue([0, src]);

    while (!pq.isEmpty()) {
        let [d, u] = pq.dequeue();
        if (d > dists[u]) continue;
        for (let e of graph.adj[u]) {
            let effectiveWeight = e.weight;
            if (effectiveWeight !== Infinity) {
                if (severity === 'non-critical') effectiveWeight *= trafficFactor;
            }
            if (dists[u] + effectiveWeight < dists[e.dest]) {
                dists[e.dest] = dists[u] + effectiveWeight;
                pq.enqueue([dists[e.dest], e.dest]);
            }
        }
    }

    // Find closest hospital
    let bestHospital = null;
    let minDist = Infinity;

    for (let h of hospitals) {
        if (dists[h.id] < minDist) {
            minDist = dists[h.id];
            bestHospital = h;
        }
    }

    if (bestHospital) {
        document.getElementById('dest-node').value = bestHospital.id;
        showToast(`Nearest Hospital: ${bestHospital.label} (${minDist.toFixed(1)} min)`);
        findRoute(); // calculate path
    } else {
        showToast('Could not reach any hospital!', 'bg-red-600');
    }
}

// Show toast
function showToast(message, bg = 'bg-green-600') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `fixed bottom-6 right-6 ${bg} text-white p-3 rounded-lg shadow-lg opacity-100 transform translate-y-0`;
    setTimeout(() => toast.className += ' translate-y-10 opacity-0', 3000);
}

// Log events
function logEvent(message) {
    const logPanel = document.getElementById('log-panel');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    logPanel.innerHTML = `<div>${time} - ${message}</div>` + logPanel.innerHTML;
    if (logPanel.children.length > 5) logPanel.removeChild(logPanel.lastChild);
}

// p5.js setup
function setup() {
    let container = document.getElementById('canvas-container');
    let canvas = createCanvas(container.offsetWidth, container.offsetHeight);
    canvas.parent('canvas-container');
    canvas.mouseClicked(handleCanvasClick);
    document.getElementById('loading').style.display = 'none';

    // Resize handler
    window.addEventListener('resize', () => {
        let c = document.getElementById('canvas-container');
        resizeCanvas(c.offsetWidth, c.offsetHeight);
        // Redraw immediately
        draw();
    });

    // --- RESTORED LISTENERS ---
    // Map Toggle
    const mapToggle = document.getElementById('show-map');
    if (mapToggle) {
        mapToggle.addEventListener('change', () => {
            redraw();
        });
    }

    // Map Upload
    const mapUpload = document.getElementById('map-upload');
    if (mapUpload) {
        mapUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                mapLoaded = false;
                mapBg = loadImage(url, () => {
                    mapLoaded = true;
                    showToast("Custom Map Loaded!");
                    redraw();
                }, () => {
                    mapLoaded = false;
                    mapBg = null;
                    showToast("Error loading map image.", "bg-red-600");
                    redraw();
                });
            }
        });
    }


    // Load default map safely
    mapLoaded = false;
    mapBg = loadImage(defaultMapUrl,
        () => {
            mapLoaded = true;
            console.log("Map Loaded");
        },
        () => {
            console.warn("Map load failed, using grid");
            mapLoaded = false;
            mapBg = null;
        }
    );
}

// Handle canvas click
function handleCanvasClick() {
    if (!graph) return;

    // Check if Closure Mode is active
    const closureMode = document.getElementById('closure-mode').checked;

    let nodeClicked = false;

    // Check Nodes
    for (let node of graph.nodes) {
        let d = dist(mouseX, mouseY, node.x, node.y);
        if (d < 20) {
            nodeClicked = true;
            if (closureMode) {
                showToast("Click on a road (line) to close it, not a node.", "bg-yellow-600");
                return;
            }

            if (!document.getElementById('source-node').dataset.selected) {
                document.getElementById('source-node').value = node.id;
                document.getElementById('source-node').dataset.selected = 'true';
                showToast(`Source: ${node.label}`);
            } else {
                document.getElementById('dest-node').value = node.id;
                document.getElementById('source-node').dataset.selected = '';
                findRoute(); // Trigger route finding
                showToast(`Destination: ${node.label}`);
            }
            break;
        }
    }

    // Check Edges if no node clicked and in closure mode
    if (!nodeClicked && closureMode) {
        let bestDist = 10; // Threshold
        let bestEdge = null;
        let u_sel = -1;

        for (let u = 0; u < graph.V; u++) {
            for (let e of graph.adj[u]) {
                if (e.dest > u) { // Check unique edges
                    let v = e.dest;
                    let x1 = graph.nodes[u].x, y1 = graph.nodes[u].y;
                    let x2 = graph.nodes[v].x, y2 = graph.nodes[v].y;

                    // Point to line segment distance
                    let d = distToSegment(mouseX, mouseY, x1, y1, x2, y2);
                    if (d < bestDist) {
                        bestDist = d;
                        bestEdge = { u, v, e };
                        u_sel = u;
                    }
                }
            }
        }

        if (bestEdge) {
            // Toggle closure
            const { u, v } = bestEdge;
            // Find edge in both directions
            let edgeForward = graph.adj[u].find(edge => edge.dest === v);
            let edgeBackward = graph.adj[v].find(edge => edge.dest === u);

            if (edgeForward.weight === Infinity) {
                // Open road
                edgeForward.weight = edgeForward.baseWeight;
                if (edgeBackward) edgeBackward.weight = edgeBackward.baseWeight;
                showToast("Road Re-opened!");
            } else {
                // Close road
                edgeForward.weight = Infinity;
                if (edgeBackward) edgeBackward.weight = Infinity;
                showToast("Road Closed!");
            }
            // Re-calc only if path exists (optional, or let user click Find Route)
            // findRoute();
        }
    }
}

function distToSegment(px, py, x1, y1, x2, y2) {
    let l2 = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
    if (l2 == 0) return dist(px, py, x1, y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

// p5.js draw
function draw() {
    background(240, 248, 255);

    // Draw Map Background if enabled
    // Draw Map Background if enabled
    // Draw Map Background if enabled
    if (document.getElementById('show-map').checked) {
        if (mapLoaded && mapBg) {
            try {
                image(mapBg, 0, 0, width, height);
            } catch (e) {
                // Fallback if image draws fail
                drawGridBackground();
            }
        } else {
            // Show grid while loading or if failed
            drawGridBackground();
        }

        // Add a semi-transparent overlay to make graph visible
        fill(255, 255, 255, 200); // Increased opacity for better contrast
        rect(0, 0, width, height);
    }

    if (!graph) return;

    // Draw edges
    for (let u = 0; u < graph.V; u++) {
        for (let e of graph.adj[u]) {
            if (e.dest > u) continue;
            let weight = e.weight * parseFloat(document.getElementById('traffic-slider').value);
            let color = weight > 15 ? '#ef4444' : weight > 10 ? '#f59e0b' : '#22c55e';
            let thickness = map(weight, 5, 20, 2, 5, true);
            stroke(color);
            strokeWeight(thickness);
            line(graph.nodes[u].x, graph.nodes[u].y, graph.nodes[e.dest].x, graph.nodes[e.dest].y);
            if (e.weight === Infinity) {
                stroke('#9ca3af');
                strokeWeight(2);
                line(graph.nodes[u].x, graph.nodes[u].y, graph.nodes[e.dest].x, graph.nodes[e.dest].y);
            }
        }
    }

    // Draw path
    if (path.length > 1) {
        noFill();
        stroke('#22c55e');
        strokeWeight(4);
        for (let i = 1; i < path.length; i++) {
            let u = path[i - 1], v = path[i];
            drawingContext.setLineDash([5, 5]);
            line(graph.nodes[u].x, graph.nodes[u].y, graph.nodes[v].x, graph.nodes[v].y);
            drawingContext.setLineDash([]);
        }

        if (animationRunning) {
            let t = (frameCount % 150) / 150;
            let segment = Math.floor(ambulancePos);
            if (segment < path.length - 1) {
                let u = path[segment], v = path[segment + 1];
                let x = lerp(graph.nodes[u].x, graph.nodes[v].x, t);
                let y = lerp(graph.nodes[u].y, graph.nodes[v].y, t);
                fill('#ef4444');
                noStroke();
                ellipse(x, y, 20, 20);
                ambulancePos += 0.006;
                if (ambulancePos >= path.length - 1) animationRunning = false;
            }
        }
    }

    // Draw nodes
    for (let n of graph.nodes) {
        noStroke();
        // Color based on type
        if (n.type === 'hospital') {
            fill('#ef4444'); // Red for hospital
        } else if (n.id === parseInt(document.getElementById('source-node').value)) {
            fill('#10b981'); // Green for source override
        } else if (n.id === parseInt(document.getElementById('dest-node').value)) {
            fill('#3b82f6'); // Blue for dest override
        } else {
            fill(mouseX > n.x - 15 && mouseX < n.x + 15 && mouseY > n.y - 15 && mouseY < n.y + 15 ? '#60a5fa' : '#94a3b8');
        }

        ellipse(n.x, n.y, 30, 30); // Larger nodes for better visibility

        // Icon or Text
        fill('#ffffff');
        textSize(10);
        textAlign(CENTER, CENTER);

        if (n.type === 'hospital') {
            textSize(14);
            text("🏥", n.x, n.y + 1);
        } else {
            // text(n.id, n.x, n.y);
            width > 800 ? text(n.id, n.x, n.y) : null;
        }

        fill('#1e293b');
        textSize(12);
        textAlign(CENTER);
        text(n.label, n.x, n.y - 20);

        // Capacity display for hospitals
        if (n.type === 'hospital') {
            textSize(10);
            noStroke();
            fill(255, 255, 255, 200);
            rect(n.x - 25, n.y + 15, 50, 16, 4);
            fill(n.capacity.icu > 0 ? '#059669' : '#ef4444');
            text(`ICU: ${n.capacity.icu}`, n.x, n.y + 23);
        }
    }
}

// Default graph
// Enhanced Default Graph (City Grid style)
// Centered for typical 1366x768 or 1920x1080 screens
const defaultGraph_old = `12 18
0 1 5 arterial
0 2 6 arterial
0 3 5 arterial
0 4 7 arterial
1 5 10 highway
2 6 12 highway
3 7 11 highway
4 8 9 highway
5 6 15 local
6 7 14 local
7 8 16 local
8 5 13 local
1 2 4 arterial
5 9 8 highway
7 10 9 highway
8 11 12 highway
9 0 20 expressway
10 4 10 arterial
600 400
600 250
750 400
600 550
450 400
600 100
900 400
600 700
300 400
600 50
700 750
150 400`;

// Initialize
window.onload_old = () => {
    // Force reset for now to ensure new default graph (12 nodes) is loaded
    // localStorage.removeItem('savedGraph'); 
    // Actually, let's just ignore saved graph if it looks like the old one (starts with 5 nodes)

    let saved = localStorage.getItem('savedGraph');
    if (saved && saved.startsWith('5 ')) {
        console.log("Old graph detected, resetting to new default.");
        saved = null;
        localStorage.removeItem('savedGraph');
    }

    document.getElementById('graph-input').value = saved || defaultGraph;
    loadGraph();
};

function downloadGraphPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Get the graph input text
    const graphText = document.getElementById('graph-input').value;

    // Add a title
    doc.setFontSize(16);
    doc.text("Ambulance Route Graph", 10, 15);

    // Add the graph text (start at y=25, split into lines)
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(graphText, 180);
    doc.text(lines, 10, 25);

    // Save the PDF
    doc.save("ambulance-graph.pdf");
}

// Helper for fallback map
function drawGridBackground() {
    stroke(200); // Darker gray line
    strokeWeight(1);
    // Draw Grid
    for (let x = 0; x < width; x += 50) line(x, 0, x, height);
    for (let y = 0; y < height; y += 50) line(0, y, width, y);

    // Draw 'Parks' (Green areas)
    noStroke();
    fill('#bbf7d0'); // Vibrant green
    rect(100, 100, 200, 150, 20);
    rect(width - 250, height - 200, 180, 120, 20);

    // Draw 'Water' (Blue areas)
    fill('#dbeafe'); // light blue
    beginShape();
    vertex(0, height - 100);
    bezierVertex(200, height - 150, width - 200, height - 50, width, height - 100);
    vertex(width, height);
    vertex(0, height);
    endShape(CLOSE);
}

function resetGraph() {
    if (confirm('Reset to default city layout?')) {
        localStorage.removeItem('savedGraph');
        document.getElementById('graph-input').value = defaultGraph;
        loadGraph();
        showToast('Graph reset to default.');
    }
}


// Default graph
// Enhanced Default Graph (City Grid style)
// Compact & Centered (Fits between X=420 and X=980)
// Center X: 700, Spacing: 75
const defaultGraph = `12 18
0 1 5 arterial
0 2 6 arterial
0 3 5 arterial
0 4 7 arterial
1 5 10 highway
2 6 12 highway
3 7 11 highway
4 8 9 highway
5 6 15 local
6 7 14 local
7 8 16 local
8 5 13 local
1 2 4 arterial
5 9 8 highway
7 10 9 highway
8 11 12 highway
9 0 20 expressway
10 4 10 arterial
700 450
700 350
775 450
700 550
625 450
700 250
850 450
700 650
550 450
700 150
625 650
475 450`;

// Initialize
window.onload = () => {
    let saved = localStorage.getItem('savedGraph');
    // Check for ANY older graph signatures to force reset
    // Checks for old centers (600, 750, 850) or old spacing (150, padding)
    if (saved && (saved.startsWith('5 ') || saved.includes('150 400') || saved.includes('600 400') || saved.includes('750 400') || saved.includes('850 400') || saved.includes('1050 400'))) {
        console.log('Legacy graph layout detected. Auto-resetting to new compact center.');
        saved = null;
        localStorage.removeItem('savedGraph');
    }

    document.getElementById('graph-input').value = saved || defaultGraph;
    loadGraph();
};
