#include "NativeSceneAssets.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture2D.h"
#include "GameFramework/Actor.h"
#include "ImageUtils.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "MeshDescription.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ResidenceTraffic.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"

namespace
{
FVector Vector(const TArray<TSharedPtr<FJsonValue>> &Values)
{
    return FVector(Values[0]->AsNumber(), Values[1]->AsNumber(), Values[2]->AsNumber());
}

template <typename T> TArray<T> ReadBuffer(const TArray<uint8> &Bytes, const TSharedPtr<FJsonObject> &Range)
{
    TArray<T> Values;
    const int64 Offset = static_cast<int64>(Range->GetNumberField(TEXT("offset")));
    const int64 Count = static_cast<int64>(Range->GetNumberField(TEXT("count")));
    if (Offset < 0 || Count < 0 || Offset > Bytes.Num() || Count > (Bytes.Num() - Offset) / sizeof(T))
        return Values;
    Values.SetNumUninitialized(Count);
    FMemory::Memcpy(Values.GetData(), Bytes.GetData() + Offset, Count * sizeof(T));
    return Values;
}
} // namespace

bool DistantStars::LoadResidence(AActor *Owner, USceneComponent *Parent, FResidenceTraffic &Traffic,
                                 FString &Error)
{
    const FString Root = FPaths::ProjectContentDir() / TEXT("SceneData");
    FString Raw;
    TArray<uint8> Bytes;
    TSharedPtr<FJsonObject> Data;
    if (!FFileHelper::LoadFileToString(Raw, *(Root / TEXT("residence.json"))) ||
        !FFileHelper::LoadFileToArray(Bytes, *(Root / TEXT("residence.bin"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Raw), Data) || !Data ||
        Data->GetNumberField(TEXT("version")) != 1)
    {
        Error = TEXT("Residence assets are missing or have an unsupported version.");
        return false;
    }
    TArray<UMaterialInstanceDynamic *> Materials;
    TMap<FString, UTexture2D *> Textures;
    for (const auto &Value : Data->GetArrayField(TEXT("materials")))
    {
        const auto Material = Value->AsObject();
        const bool bUnlit = Material->GetBoolField(TEXT("unlit"));
        const double Opacity = Material->GetNumberField(TEXT("opacity"));
        const TCHAR *Asset = Opacity < 1 ? TEXT("/Game/Materials/M_SceneGlass.M_SceneGlass")
                             : bUnlit    ? TEXT("/Game/Materials/M_SceneUnlit.M_SceneUnlit")
                                         : TEXT("/Game/Materials/M_SceneLit.M_SceneLit");
        auto Base = LoadObject<UMaterialInterface>(nullptr, Asset);
        if (!Base)
        {
            Error = FString::Printf(TEXT("Missing material %s. Run asset preparation."), Asset);
            return false;
        }
        auto Instance = UMaterialInstanceDynamic::Create(Base, Owner);
        const FVector Color = Vector(Material->GetArrayField(TEXT("color")));
        const FVector Emissive = Vector(Material->GetArrayField(TEXT("emissive")));
        Instance->SetVectorParameterValue(TEXT("Color"), FLinearColor(Color.X, Color.Y, Color.Z));
        Instance->SetVectorParameterValue(TEXT("Emission"), FLinearColor(Emissive.X, Emissive.Y, Emissive.Z));
        Instance->SetScalarParameterValue(TEXT("Roughness"), Material->GetNumberField(TEXT("roughness")));
        Instance->SetScalarParameterValue(TEXT("Metalness"), Material->GetNumberField(TEXT("metalness")));
        Instance->SetScalarParameterValue(TEXT("Opacity"), Opacity);
        FString Projection;
        if (Material->TryGetStringField(TEXT("projection"), Projection))
        {
            Instance->SetScalarParameterValue(TEXT("Facade"), Projection == TEXT("facade") ? 1 : 0);
            Instance->SetScalarParameterValue(TEXT("Roof"), Projection == TEXT("roof") ? 1 : 0);
        }
        const auto &Repeat = Material->GetArrayField(TEXT("repeat"));
        const auto &Offset = Material->GetArrayField(TEXT("offset"));
        Instance->SetVectorParameterValue(TEXT("UVTransform"),
                                          FLinearColor(Repeat[0]->AsNumber(), Repeat[1]->AsNumber(),
                                                       Offset[0]->AsNumber(), Offset[1]->AsNumber()));
        Instance->SetScalarParameterValue(TEXT("FlipY"), Material->GetBoolField(TEXT("flipY")) ? 1.f : 0.f);
        const TMap<FString, FString> TextureSlots = {{TEXT("map"), TEXT("BaseTexture")},
                                                     {TEXT("normal"), TEXT("NormalTexture")},
                                                     {TEXT("roughnessMap"), TEXT("RoughnessTexture")},
                                                     {TEXT("metalnessMap"), TEXT("MetalnessTexture")},
                                                     {TEXT("emissiveMap"), TEXT("EmissionTexture")}};
        for (const auto &Slot : TextureSlots)
        {
            FString Filename;
            if (!Material->TryGetStringField(Slot.Key, Filename))
                continue;
            const bool bLinear = Slot.Key == TEXT("normal") || Slot.Key == TEXT("roughnessMap") ||
                                 Slot.Key == TEXT("metalnessMap");
            const FString TextureKey = Filename + (bLinear ? TEXT("-linear") : TEXT("-color"));
            UTexture2D *&Texture = Textures.FindOrAdd(TextureKey);
            if (!Texture)
            {
                Texture = FImageUtils::ImportFileAsTexture2D(Root / TEXT("textures") / Filename);
                if (!Texture)
                {
                    Error = TEXT("Unable to decode residence texture: ") + Filename;
                    return false;
                }
                Texture->SRGB = !bLinear;
                Texture->AddressX = TA_Wrap;
                Texture->AddressY = TA_Wrap;
                Texture->UpdateResource();
            }
            Instance->SetTextureParameterValue(*Slot.Value, Texture);
            Instance->SetScalarParameterValue(*(TEXT("Use") + Slot.Value), 1);
        }
        Materials.Add(Instance);
    }

    TArray<UHierarchicalInstancedStaticMeshComponent *> Batches;
    for (const auto &Value : Data->GetArrayField(TEXT("meshes")))
    {
        const auto Source = Value->AsObject();
        const auto Positions = ReadBuffer<float>(Bytes, Source->GetObjectField(TEXT("positions")));
        const auto Indices = ReadBuffer<uint32>(Bytes, Source->GetObjectField(TEXT("indices")));
        const auto Normals = Source->HasTypedField<EJson::Object>(TEXT("normals"))
                                 ? ReadBuffer<float>(Bytes, Source->GetObjectField(TEXT("normals")))
                                 : TArray<float>();
        const auto UV = Source->HasTypedField<EJson::Object>(TEXT("uv"))
                            ? ReadBuffer<float>(Bytes, Source->GetObjectField(TEXT("uv")))
                            : TArray<float>();
        if (Positions.Num() % 3 || Indices.Num() % 3)
        {
            Error = TEXT("Invalid residence geometry layout.");
            return false;
        }
        FMeshDescription Description;
        FStaticMeshAttributes Attributes(Description);
        Attributes.Register();
        auto VertexPositions = Attributes.GetVertexPositions();
        auto VertexNormals = Attributes.GetVertexInstanceNormals();
        auto VertexUV = Attributes.GetVertexInstanceUVs();
        VertexUV.SetNumChannels(1);
        TArray<FVertexID> Vertices;
        for (int32 I = 0; I < Positions.Num(); I += 3)
        {
            const auto Vertex = Description.CreateVertex();
            VertexPositions[Vertex] =
                FVector3f(ToNative(FVector(Positions[I], Positions[I + 1], Positions[I + 2])));
            Vertices.Add(Vertex);
        }
        auto Mesh = NewObject<UStaticMesh>(Owner);
        TArray<FPolygonGroupID> Groups;
        for (const auto &MaterialIndex : Source->GetArrayField(TEXT("materials")))
        {
            const auto Group = Description.CreatePolygonGroup();
            const FName Slot(*FString::Printf(TEXT("Material_%d"), Groups.Num()));
            Attributes.GetPolygonGroupMaterialSlotNames()[Group] = Slot;
            Groups.Add(Group);
            const int32 Index = static_cast<int32>(MaterialIndex->AsNumber());
            if (!Materials.IsValidIndex(Index))
            {
                Error = TEXT("Invalid residence material index.");
                return false;
            }
            Mesh->GetStaticMaterials().Add(FStaticMaterial(Materials[Index], Slot));
        }
        const auto &Ranges = Source->GetArrayField(TEXT("groups"));
        for (int32 I = 0; I < Indices.Num(); I += 3)
        {
            int32 GroupIndex = 0;
            for (const auto &RangeValue : Ranges)
            {
                const auto Range = RangeValue->AsObject();
                const int32 Start = static_cast<int32>(Range->GetNumberField(TEXT("start")));
                if (I >= Start && I < Start + Range->GetNumberField(TEXT("count")))
                    GroupIndex = static_cast<int32>(Range->GetNumberField(TEXT("materialIndex")));
            }
            if (!Groups.IsValidIndex(GroupIndex))
            {
                Error = TEXT("Invalid residence geometry group.");
                return false;
            }
            TArray<FVertexInstanceID, TFixedAllocator<3>> Corners;
            // Coordinate reflection converts the source CCW faces to Unreal clockwise faces.
            for (int32 K : {0, 1, 2})
            {
                const uint32 Index = Indices[I + K];
                if (!Vertices.IsValidIndex(Index))
                {
                    Error = TEXT("Invalid residence vertex index.");
                    return false;
                }
                const auto Corner = Description.CreateVertexInstance(Vertices[Index]);
                if (Normals.Num() == Positions.Num())
                    VertexNormals[Corner] = FVector3f(ToNative(
                        FVector(Normals[Index * 3], Normals[Index * 3 + 1], Normals[Index * 3 + 2]), 1));
                else
                    VertexNormals[Corner] = FVector3f::UpVector;
                if (UV.IsValidIndex(Index * 2 + 1))
                    VertexUV.Set(Corner, 0, FVector2f(UV[Index * 2], UV[Index * 2 + 1]));
                Corners.Add(Corner);
            }
            Description.CreateTriangle(Groups[GroupIndex], Corners);
        }
        FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Description);
        FStaticMeshOperations::ComputeTangentsAndNormals(Description, EComputeNTBsFlags::Tangents |
                                                                          EComputeNTBsFlags::UseMikkTSpace);
        UStaticMesh::FBuildMeshDescriptionsParams Params;
        Params.bFastBuild = true;
        Params.bUseHashAsGuid = true;
        Params.bMarkPackageDirty = false;
        Mesh->BuildFromMeshDescriptions({&Description}, Params);
        // Cooked clients do not run the editor's UV-density build. The imported
        // textures are non-streaming, but the mesh streaming query still needs
        // initialized channel metadata before registering an instance batch.
        for (auto &StaticMaterial : Mesh->GetStaticMaterials())
            if (!StaticMaterial.UVChannelData.bInitialized)
                StaticMaterial.UVChannelData = FMeshUVChannelInfo(1.0f);
        auto Batch = NewObject<UHierarchicalInstancedStaticMeshComponent>(Owner);
        Owner->AddInstanceComponent(Batch);
        Batch->SetupAttachment(Parent);
        Batch->SetStaticMesh(Mesh);
        Batch->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Batch->bAutoRebuildTreeOnInstanceChanges = false;
        Batch->NumCustomDataFloats = 6;
        Batch->RegisterComponent();
        Batches.Add(Batch);
    }
    int32 Count = 0;
    for (const auto &Value : Data->GetArrayField(TEXT("instances")))
    {
        const auto Instance = Value->AsObject();
        const int32 Index = static_cast<int32>(Instance->GetNumberField(TEXT("mesh")));
        if (!Batches.IsValidIndex(Index))
        {
            Error = TEXT("Invalid residence instance index.");
            return false;
        }
        const auto &Rotation = Instance->GetArrayField(TEXT("rotation"));
        const FVector Scale = Vector(Instance->GetArrayField(TEXT("scale")));
        const FQuat Quaternion(Rotation[2]->AsNumber(), -Rotation[0]->AsNumber(), -Rotation[1]->AsNumber(),
                               Rotation[3]->AsNumber());
        const int32 NativeIndex = Batches[Index]->AddInstance(
            FTransform(Quaternion, ToNative(Vector(Instance->GetArrayField(TEXT("position")))),
                       FVector(Scale.Z, Scale.X, Scale.Y)));
        const auto &Tint = Instance->GetArrayField(TEXT("color"));
        for (int32 Channel = 0; Channel < 3; Channel++)
            Batches[Index]->SetCustomDataValue(NativeIndex, Channel, Tint[Channel]->AsNumber(), false);
        Batches[Index]->SetCustomDataValue(NativeIndex, 3, Scale.Z, false);
        Batches[Index]->SetCustomDataValue(NativeIndex, 4, Scale.X, false);
        Batches[Index]->SetCustomDataValue(NativeIndex, 5, Scale.Y, false);
        FString Motion;
        if (Instance->TryGetStringField(TEXT("motion"), Motion))
            Traffic.Bind(Motion, Instance->GetNumberField(TEXT("motionIndex")), Batches[Index], NativeIndex);
        Count++;
    }
    for (auto Batch : Batches)
    {
        Batch->bAutoRebuildTreeOnInstanceChanges = false;
        Batch->BuildTreeIfOutdated(true, true);
    }
    UE_LOG(LogTemp, Display,
           TEXT("DistantStars: imported %d native residence mesh batches and %d "
                "instances"),
           Batches.Num(), Count);
    if (!Traffic.Load())
    {
        Error = TEXT("Missing residence traffic data.");
        return false;
    }
    return true;
}
