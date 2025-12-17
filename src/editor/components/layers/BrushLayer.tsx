import { Line, Group } from 'react-konva';
import type { BrushLayer as BrushLayerType, BrushStroke } from '../../state/editorTypes';

interface BrushLayerProps {
  layer: BrushLayerType;
  id?: string;
  onClick?: (e: any) => void;
  onTap?: (e: any) => void;
  onDragStart?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  onTransformStart?: (e: any) => void;
  onTransformEnd?: (e: any) => void;
  draggable?: boolean;
}

// Render a single stroke with its settings
const StrokeRenderer = ({ stroke, index }: { stroke: BrushStroke; index: number }) => {
  if (!stroke.points || stroke.points.length < 2) return null;

  // For eraser mode
  if (stroke.color === 'transparent') {
    return (
      <Line
        key={index}
        points={stroke.points}
        stroke="#ffffff"
        strokeWidth={stroke.size}
        lineCap="round"
        lineJoin="round"
        tension={0.5}
        globalCompositeOperation="destination-out"
        opacity={stroke.opacity}
      />
    );
  }

  // Calculate shadow blur based on hardness (lower hardness = more blur = softer edge)
  const shadowBlur = stroke.hardness < 100 ? ((100 - stroke.hardness) / 100) * stroke.size * 0.5 : 0;
  
  // Map blend mode to globalCompositeOperation
  type CompositeOp = 'source-over' | 'multiply' | 'screen' | 'overlay';
  const blendModeMap: Record<string, CompositeOp> = {
    'normal': 'source-over',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
  };
  const compositeOp: CompositeOp = blendModeMap[stroke.blendMode] || 'source-over';

  // For soft brushes (hardness < 100), use shadow effect for feathering
  if (shadowBlur > 0) {
    return (
      <Line
        key={index}
        points={stroke.points}
        stroke={stroke.color}
        strokeWidth={stroke.size}
        lineCap="round"
        lineJoin="round"
        tension={0.5}
        opacity={stroke.opacity}
        shadowColor={stroke.color}
        shadowBlur={shadowBlur}
        shadowEnabled={true}
        globalCompositeOperation={compositeOp}
      />
    );
  }

  // Hard brush (hardness = 100)
  return (
    <Line
      key={index}
      points={stroke.points}
      stroke={stroke.color}
      strokeWidth={stroke.size}
      lineCap="round"
      lineJoin="round"
      tension={0.5}
      opacity={stroke.opacity}
      globalCompositeOperation={compositeOp}
    />
  );
};

export const BrushLayer = ({ 
  layer,
  id,
  onClick,
  onTap,
  onDragStart,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
  draggable 
}: BrushLayerProps) => {
  const strokes = layer.strokes || [];

  if (strokes.length === 0) {
    // Return an invisible placeholder for selection
    return (
      <Group
        id={id || layer.id}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        opacity={layer.opacity}
        visible={layer.visible}
        listening={!layer.locked}
        onClick={onClick}
        onTap={onTap}
      >
        <Line
          points={[0, 0, 1, 1]}
          stroke="transparent"
          strokeWidth={1}
        />
      </Group>
    );
  }

  return (
    <Group
      id={id || layer.id}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity}
      visible={layer.visible}
      listening={!layer.locked}
      onClick={onClick}
      onTap={onTap}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTransformStart={onTransformStart}
      onTransformEnd={onTransformEnd}
      draggable={draggable}
    >
      {strokes.map((stroke, index) => (
        <StrokeRenderer key={index} stroke={stroke} index={index} />
      ))}
    </Group>
  );
};
