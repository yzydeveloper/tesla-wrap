import { Transformer } from 'react-konva';
import { useEffect, useRef } from 'react';
import type Konva from 'konva';

interface TransformerWrapperProps {
  selectedLayerId: string | null;
  layers: any[];
}

export const TransformerWrapper = ({ selectedLayerId, layers }: TransformerWrapperProps) => {
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!transformerRef.current || !selectedLayerId) return;

    const stage = transformerRef.current.getStage();
    if (!stage) return;

    const selectedNode = stage.findOne(`#${selectedLayerId}`);
    if (selectedNode) {
      transformerRef.current.nodes([selectedNode]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedLayerId, layers]);

  if (!selectedLayerId) return null;

  return (
    <Transformer
      ref={transformerRef}
      boundBoxFunc={(oldBox: any, newBox: any) => {
        // Limit resize
        if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
          return oldBox;
        }
        return newBox;
      }}
      // Modern styling for transformer - Tesla red theme
      borderEnabled={true}
      borderStroke="#B73038"
      borderStrokeWidth={2}
      borderDash={[5, 5]}
      anchorFill="#ffffff"
      anchorStroke="#B73038"
      anchorStrokeWidth={2}
      anchorSize={10}
      rotateAnchorOffset={30}
      // Better visual feedback
      keepRatio={false}
      centeredScaling={false}
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
    />
  );
};

