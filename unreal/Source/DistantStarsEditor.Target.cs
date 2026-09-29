using UnrealBuildTool;

public class DistantStarsEditorTarget : TargetRules
{
    public DistantStarsEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("DistantStars");
    }
}
