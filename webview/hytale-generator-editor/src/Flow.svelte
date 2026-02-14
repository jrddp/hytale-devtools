<script>
	import {
		addEdge,
		Background,
		SvelteFlow,
		useSvelteFlow
	} from '@xyflow/svelte';
	import { createEventDispatcher, tick } from 'svelte';

	import '@xyflow/svelte/dist/style.css';

	export let nodes = createDefaultNodes();
	export let edges = [];
	export let loadVersion = 0;

	const dispatch = createEventDispatcher();

	const { screenToFlowPosition, fitView } = useSvelteFlow();
	let lastFittedLoadVersion = -1;

	$: if (loadVersion !== lastFittedLoadVersion) {
		lastFittedLoadVersion = loadVersion;
		void fitGraphInView();
	}

	const emitFlowChange = (reason) => {
		dispatch('flowchange', {
			reason,
			nodes,
			edges
		});
	};

	const handleConnect = (connection) => {
		edges = addEdge(connection, edges);
		emitFlowChange('edge-created');
	};

	const handleNodeDragStop = () => {
		emitFlowChange('node-moved');
	};

	const handleConnectEnd = (event, connectionState) => {
		if (connectionState.isValid) {
			return;
		}

		const sourceNodeId =
			connectionState.fromNode?.id ??
			nodes[0]?.id ??
			'Node-00000000-0000-0000-0000-000000000000';
		const newNodeType = normalizeNodeType(connectionState.fromNode?.type);
		const newNodeId = `${newNodeType}-${createUuid()}`;
		const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;

		const newNode = {
			id: newNodeId,
			data: { label: newNodeType },
			position: screenToFlowPosition({
				x: clientX,
				y: clientY
			}),
			origin: [0.5, 0.0]
		};

		nodes = [...nodes, newNode];
		edges = [
			...edges,
			{
				source: sourceNodeId,
				target: newNodeId,
				id: `${sourceNodeId}--${newNodeId}`
			}
		];
		emitFlowChange('node-created');
	};

	function createDefaultNodes() {
		return [
			{
				id: 'Node-00000000-0000-0000-0000-000000000000',
				type: 'input',
				data: { label: 'Node' },
				position: { x: 0, y: 50 }
			}
		];
	}

	function normalizeNodeType(candidate) {
		if (typeof candidate === 'string') {
			const cleaned = candidate.trim().replace(/[^A-Za-z0-9_]/g, '');
			if (cleaned) {
				return cleaned;
			}
		}

		return 'Node';
	}

	function createUuid() {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}

		return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	}

	async function fitGraphInView() {
		await tick();
		if (!nodes.length) {
			return;
		}

		fitView({
			padding: 0.2,
			duration: 200
		});
	}
</script>

<div class="h-full w-full">
	<SvelteFlow
		bind:nodes
		bind:edges
		fitView
		onconnect={handleConnect}
		onconnectend={handleConnectEnd}
		onnodedragstop={handleNodeDragStop}
	>
		<Background />
	</SvelteFlow>
</div>
