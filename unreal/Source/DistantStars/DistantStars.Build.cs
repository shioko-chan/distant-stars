using UnrealBuildTool;

public class DistantStars : ModuleRules
{
    public DistantStars(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore" });
        PrivateDependencyModuleNames.AddRange(new[] {
            "Slate", "SlateCore", "WebBrowser", "HTTPServer", "HTTP", "Json",
            "ProceduralMeshComponent", "ImageWrapper", "RenderCore", "RHI",
            "MeshDescription", "StaticMeshDescription"
        });
    }
}
