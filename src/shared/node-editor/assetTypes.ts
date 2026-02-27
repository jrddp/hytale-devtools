export interface DefinedPosition {
  $x: number;
  $y: number;
}

export type NodeAssetJson = {
  $NodeId?: string | undefined;
  $Position?: DefinedPosition | undefined; // legacy only position definition
  $Comment?: string;
  [key: string]: unknown;
};

export type GroupJson = {
  $NodeId?: string; // doesn't exist in base-game saved JSON, but makes things easier with VSCode's reserialization
  $Position: DefinedPosition;
  $width: number;
  $height: number;
  $name: string;
};

export type NodeEditorMetadata = {
  $Nodes?: Record<
    string,
    {
      $Position: DefinedPosition;
      $Title: string;
    }
  >;
  $FloatingNodes?: NodeAssetJson[];
  $Links?: Record<
    string,
    {
      $Position: DefinedPosition;
      $Title: string;
      inputConnections: string[]; // connections in the format of {NodeId}:{LocalPinId}
      outputConnections: string[];
      sourceEndpoint?: string;
      targetEndpoint?: string;
    }
  >;
  $Groups?: GroupJson[];
  $Comments?: {
    $NodeId?: string; // doesn't exist in base-game saved JSON, but makes things easier with VSCode's reserialization
    $Position: DefinedPosition;
    $width: number;
    $height: number;
    $name: string;
    $text: string;
    $fontSize: number;
  }[];
  $WorkspaceID?: string;
};

export type AssetDocumentShape = {
  $NodeEditorMetadata?: NodeEditorMetadata;
  $Groups?: GroupJson[];
} & NodeAssetJson;

