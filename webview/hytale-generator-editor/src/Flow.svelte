<script>
	import {
		Background,
		SvelteFlow,
		useSvelteFlow
	} from '@xyflow/svelte';

	import '@xyflow/svelte/dist/style.css';

	const initialNodes = [
		{
			id: '0',
			type: 'input',
			data: { label: 'Node' },
			position: { x: 0, y: 50 }
		}
	];

	let nodes = initialNodes;
	let edges = [];

	let id = 1;
	const getId = () => `${id++}`;

	const { screenToFlowPosition } = useSvelteFlow();

	const handleConnectEnd = (event, connectionState) => {
		if (connectionState.isValid) {
			return;
		}

		const sourceNodeId = connectionState.fromNode?.id ?? '1';
		const newNodeId = getId();
		const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;

		const newNode = {
			id: newNodeId,
			data: { label: `Node ${newNodeId}` },
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
	};
</script>

<div class="h-full w-full">
	<SvelteFlow bind:nodes bind:edges fitView onconnectend={handleConnectEnd}>
		<Background />
	</SvelteFlow>
</div>
