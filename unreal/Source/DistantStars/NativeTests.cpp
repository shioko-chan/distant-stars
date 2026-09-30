#include "NativeSceneAssets.h"
#include "Misc/AutomationTest.h"
#include "Engine/Texture2D.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "ResidenceTraffic.h"
#if WITH_EDITOR
#include "TextureCompiler.h"
#endif

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FNativeCoordinateTest, "DistantStars.Native.Coordinates",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FNativeCoordinateTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("Forward maps to Unreal X"), DistantStars::ToNative(FVector(0, 0, -1)), FVector(100, 0, 0));
    TestEqual(TEXT("North maps to Unreal Z"), DistantStars::ToNative(FVector(0, 1, 0)), FVector(0, 0, 100));
    const FVector Point(.4, -.7, .8);
    for (const double Units : {100.0, 1000.0, 100000.0})
        TestTrue(TEXT("View coordinates round trip"), DistantStars::FromNative(DistantStars::ToNative(Point, Units), Units).Equals(Point, 1.e-10));
    // glTF CCW must become clockwise for Unreal. Reversing indices again causes backface normal flips.
    const FVector A = DistantStars::ToNative(FVector(1, 0, 0));
    const FVector B = DistantStars::ToNative(FVector(1, 1, 0));
    const FVector C = DistantStars::ToNative(FVector(1, 0, 1));
    const FVector ExpectedNormal = DistantStars::ToNative(FVector(1, 0, 0), 1);
    TestTrue(TEXT("Reflected winding matches clockwise faces"), FVector::DotProduct(FVector::CrossProduct(B-A,C-A), ExpectedNormal)<0);
    TestEqual(TEXT("Earth retains kilometre scale for the atmosphere"),
              DistantStars::OrbitalDisplayUnits(FVector(0, 15, -25443), 6371, false), 100000.);
    const FVector Remote(0, 0, -4.e9);
    const double DisplayUnits = DistantStars::OrbitalDisplayUnits(Remote, 25000, false);
    TestTrue(TEXT("Remote planet transform fits the GPU precision budget"), Remote.Size() * DisplayUnits <= 1.e10);
    TestTrue(TEXT("Sky shell preserves angular radius"),
             FMath::IsNearlyEqual(25000 * DisplayUnits / (Remote.Size() * DisplayUnits), 25000 / Remote.Size(), 1.e-12));
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FNativeTextureTest, "DistantStars.Native.CookedTextures",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FNativeTextureTest::RunTest(const FString& Parameters)
{
    auto Floor = LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/Residence/T_texture_0_color"));
    auto Normal = LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/Residence/T_texture_1_normal"));
    auto Earth = LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/Solar/T_earth_daymap"));
    auto Clouds = LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/Solar/T_earth_clouds"));
    if (!TestNotNull(TEXT("Floor texture"), Floor) || !TestNotNull(TEXT("Normal texture"), Normal) ||
        !TestNotNull(TEXT("Earth texture"), Earth) || !TestNotNull(TEXT("Cloud texture"), Clouds))
        return false;
#if WITH_EDITOR
    FTextureCompilingManager::Get().FinishAllCompilation();
#endif
    TestTrue(TEXT("Colour is sRGB; normals are linear"), Floor->SRGB && !Normal->SRGB);
    TestTrue(TEXT("Normal map uses native compression"), Normal->CompressionSettings == TC_Normalmap);
    TestTrue(TEXT("Floor has filtered distant mip levels"), Floor->GetNumMips() > 1);
    TestTrue(TEXT("Planet stays sharp without mesh UV density metadata"), Earth->NeverStream && Clouds->NeverStream);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FNativeTrafficTest, "DistantStars.Native.MovingInstances",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FNativeTrafficTest::RunTest(const FString& Parameters)
{
    FResidenceTraffic Traffic;
    if (!TestTrue(TEXT("Traffic paths load"), Traffic.Load())) return false;
    auto Mesh = NewObject<UInstancedStaticMeshComponent>();
    Mesh->SetCanEverAffectNavigation(false);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->AddInstance(FTransform::Identity);
    Traffic.Bind(TEXT("flying-vehicles"), 0, Mesh, 0);
    Traffic.Tick(0);
    FTransform Before, After;
    Mesh->GetInstanceTransform(0, Before);
    Traffic.Tick(1);
    Mesh->GetInstanceTransform(0, After);
    TestTrue(TEXT("Vehicle follows its route after splitting static/dynamic batches"),
             FVector::Dist(Before.GetLocation(), After.GetLocation()) > 1);
    TestEqual(TEXT("Animation updates the existing instance"), Mesh->GetInstanceCount(), 1);
    return true;
}
#endif
